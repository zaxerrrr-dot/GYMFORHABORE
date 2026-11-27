import XCTest
@testable import WatchCore

/// Synthetic wrist signals for RepCounter: smooth reps (a raised cosine per half), pauses, noise,
/// tremor, an unrack and a re-rack. The same generator is in port/rep-counter.test.mjs.
struct RepSynth {
    var fs = 50.0
    private var seed: UInt64
    private(set) var samples: [RepSample] = []
    private var t = 0.0
    /// The position (m) or the tilt (rad) the last move ended at.
    private var pos = 0.0
    var dir = Vec3(x: 0, y: 0, z: 1)
    var rotation = false
    var radius = 0.3
    var noise = 0.02
    var gyroNoise = 0.03
    /// A constant error on the vertical acceleration (g), as a badly calibrated sensor would have.
    var bias = 0.0
    var tremor = 0.0
    var tremorHz = 9.0

    init(seed: UInt64 = 1) { self.seed = seed }

    private mutating func rand() -> Double {
        seed = seed &* 6364136223846793005 &+ 1442695040888963407
        return Double(seed >> 11) / Double(1 << 53)
    }

    private mutating func gauss() -> Double {
        let u = max(1e-12, rand()), v = rand()
        return (-2 * log(u)).squareRoot() * cos(2 * Double.pi * v)
    }

    /// One move from where it is to `to` over `secs` (a raised cosine), or a stop when it stays.
    mutating func move(to: Double, secs: Double) {
        let n = max(1, Int((secs * fs).rounded()))
        let from = pos
        for i in 0..<n {
            let tau = (Double(i) + 0.5) / Double(n)
            let A = to - from
            let w = Double.pi / secs
            let p = from + A * (1 - cos(Double.pi * tau)) / 2
            let vel = A * w / 2 * sin(Double.pi * tau)
            let acc = A * w * w / 2 * cos(Double.pi * tau)
            emit(p: p, v: vel, a: acc)
        }
        pos = to
    }

    mutating func hold(_ secs: Double) { move(to: pos, secs: secs) }

    private mutating func emit(p: Double, v: Double, a: Double) {
        var accW: Vec3
        var gyro = Vec3.zero
        if rotation {
            // The wrist on a forearm of `radius` turning by p radians about the watch's y axis.
            let tangential = radius * a, centripetal = radius * v * v
            accW = Vec3(x: tangential * cos(p) - centripetal * sin(p), y: 0, z: tangential * sin(p) + centripetal * cos(p)) * (1 / RepCounter.g)
            gyro = Vec3(x: 0, y: v, z: 0)
        } else {
            accW = dir.unit * (a / RepCounter.g)
        }
        let trem = tremor * sin(2 * Double.pi * tremorHz * t)
        accW = accW + Vec3(x: noise * gauss() + trem, y: noise * gauss(), z: noise * gauss() + trem + bias)
        // The gyroscope: its own noise, and the tremor turns the wrist a little too.
        gyro = gyro + Vec3(x: gyroNoise * gauss() + tremor * 2 * trem, y: gyroNoise * gauss(), z: gyroNoise * gauss())
        samples.append(RepSample(t: t, acc: accW, gyro: gyro))
        t += 1 / fs
    }

    /// `n` reps of `range` (m, or rad for rotation): eccentric first (down, then up) or concentric first.
    mutating func reps(_ n: Int, range: Double, up: Double, down: Double, top: Double = 0.3, bottom: Double = 0.2, eccentricFirst: Bool = false) {
        for _ in 0..<n {
            if eccentricFirst {
                move(to: pos - range, secs: down); hold(bottom)
                move(to: pos + range, secs: up); hold(top)
            } else {
                move(to: pos + range, secs: up); hold(top)
                move(to: pos - range, secs: down); hold(bottom)
            }
        }
    }

    /// The counter over everything generated.
    func count(_ p: RepProfile, scale: Double = 1) -> RepCounter {
        var c = RepCounter(profile: p, scale: scale, fs: fs)
        for s in samples { c.add(s) }
        return c
    }
}

final class RepCounterTests: XCTestCase {
    let bench = RepProfiles.profile("0025")!
    let squat = RepProfiles.profile("0043")!
    let dead = RepProfiles.profile("0032")!
    let curl = RepProfiles.profile("0294")!
    let raise = RepProfiles.profile("0334")!
    let pushdown = RepProfiles.profile("2249")!
    let facePull = RepProfiles.profile("5656")!
    let cross = RepProfiles.profile("0155")!

    func testThirtyExercisesEachWithAProfile() {
        XCTAssertEqual(RepProfiles.ordered.count, 30)
        XCTAssertEqual(Set(RepProfiles.ordered.map { $0.id }).count, 30)
        XCTAssertNil(RepProfiles.profile("0739"))   // the leg press is a machine: not counted
        XCTAssertTrue(RepProfiles.profile("0292")!.oneArm)
    }

    func testBenchPressWithUnrackAndRerack() {
        var s = RepSynth(seed: 7)
        s.hold(2)
        s.dir = Vec3(x: 1, y: 0, z: 0.15); s.move(to: 0.3, secs: 1.0)   // the unrack: out over the chest
        s.dir = Vec3(x: 0, y: 0, z: 1)
        s.hold(1)
        s.reps(10, range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true)
        s.dir = Vec3(x: -1, y: 0, z: 0.15); s.move(to: 0.0, secs: 1.0)  // back into the rack
        s.hold(3)
        XCTAssertEqual(s.count(bench).reps, 10)
    }

    func testSlowSquatsWithAPauseAtTheBottom() {
        var s = RepSynth(seed: 3)
        s.hold(2)
        s.reps(8, range: 0.5, up: 1.6, down: 2.5, bottom: 0.6, eccentricFirst: true)
        s.hold(2)
        XCTAssertEqual(s.count(squat).reps, 8)
    }

    func testFastReps() {
        var s = RepSynth(seed: 4)
        s.hold(1.5)
        s.reps(12, range: 0.35, up: 0.5, down: 0.55, top: 0.1, bottom: 0.1, eccentricFirst: true)
        s.hold(2)
        XCTAssertEqual(s.count(bench).reps, 12)
    }

    func testDeadliftsFromTheFloorWithAStopBetweenReps() {
        var s = RepSynth(seed: 5)
        s.hold(2)
        s.reps(6, range: 0.5, up: 1.2, down: 1.4, top: 0.8, bottom: 2.5)
        s.hold(2)
        XCTAssertEqual(s.count(dead).reps, 6)
    }

    func testARestPauseInTheMiddleDoesNotEndTheSet() {
        var s = RepSynth(seed: 6)
        s.hold(2)
        s.reps(5, range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true)
        s.hold(4)
        s.reps(5, range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true)
        s.hold(1)
        let c = s.count(bench)
        XCTAssertEqual(c.reps, 10)
        XCTAssertFalse(c.ended)
    }

    func testTremorAndNoiseAreNoReps() {
        var s = RepSynth(seed: 8)
        s.noise = 0.03; s.tremor = 0.08
        s.hold(1.5)
        s.reps(10, range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true)
        s.hold(2)
        XCTAssertEqual(s.count(bench).reps, 10)
        var still = RepSynth(seed: 9)
        still.noise = 0.03; still.tremor = 0.1
        still.hold(30)
        XCTAssertEqual(still.count(bench).reps, 0)
        XCTAssertEqual(still.count(curl).reps, 0)
    }

    func testTheSetEndsAfterFiveStillSeconds() {
        var s = RepSynth(seed: 10)
        s.hold(1.5)
        s.reps(6, range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true)
        s.hold(3)
        XCTAssertFalse(s.count(bench).ended)
        s.hold(3)
        let c = s.count(bench)
        XCTAssertTrue(c.ended)
        XCTAssertEqual(c.reps, 6)
    }

    func testAHalfRepAtTheEndIsNotCounted() {
        var s = RepSynth(seed: 11)
        s.hold(1.5)
        s.reps(7, range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true)
        s.move(to: -0.4, secs: 1.2)   // down, and never up again (failed, the spotter took it)
        s.hold(3)
        XCTAssertEqual(s.count(bench).reps, 7)
    }

    func testTempoChangesWithinTheSet() {
        var s = RepSynth(seed: 12)
        s.hold(1.5)
        for (up, down) in [(2.0, 3.0), (1.6, 2.4), (1.2, 1.8), (0.9, 1.2), (0.8, 1.0), (0.8, 1.0), (1.4, 1.2), (2.2, 1.2)] {
            s.reps(1, range: 0.45, up: up, down: down, eccentricFirst: true)
        }
        s.hold(2)
        XCTAssertEqual(s.count(squat).reps, 8)
    }

    func testASlowEccentricAndAFastConcentric() {
        var s = RepSynth(seed: 32)
        s.hold(1.5)
        s.reps(8, range: 0.45, up: 0.7, down: 3.0, eccentricFirst: true)
        s.hold(2)
        XCTAssertEqual(s.count(bench).reps, 8)
        var c = RepSynth(seed: 33)
        c.rotation = true
        c.hold(1.5)
        c.reps(8, range: 2.0, up: 0.6, down: 2.8)
        c.hold(2)
        XCTAssertEqual(c.count(curl).reps, 8)
    }

    func testManyNoisySetsAllCountRight() {
        var wrong: [String] = []
        for seed in 40..<60 {
            var s = RepSynth(seed: UInt64(seed))
            s.noise = 0.03; s.tremor = 0.05
            s.hold(1.5)
            s.reps(10, range: 0.4, up: 1.0, down: 1.5, eccentricFirst: true)
            s.hold(2)
            if s.count(bench).reps != 10 { wrong.append("bench \(seed): \(s.count(bench).reps)") }
            var c = RepSynth(seed: UInt64(seed))
            c.rotation = true; c.noise = 0.03; c.tremor = 0.05
            c.hold(1.5)
            c.reps(10, range: 2.0, up: 1.0, down: 1.5)
            c.hold(2)
            if c.count(curl).reps != 10 { wrong.append("curl \(seed): \(c.count(curl).reps)") }
        }
        XCTAssertEqual(wrong, [])
    }

    func testASmallSensorBiasDoesNotMatter() {
        for bias in [-0.004, 0.004] {
            var s = RepSynth(seed: 34)
            s.bias = bias
            s.hold(1.5)
            s.reps(10, range: 0.4, up: 1.0, down: 1.5, eccentricFirst: true)
            s.hold(2)
            XCTAssertEqual(s.count(bench).reps, 10, "bias \(bias)")
            var q = RepSynth(seed: 35)
            q.bias = bias
            q.hold(30)
            XCTAssertEqual(q.count(bench).reps, 0, "bias \(bias), standing still")
        }
    }

    func testCurlsAsTheWristTurns() {
        var s = RepSynth(seed: 13)
        s.rotation = true
        s.hold(1.5)
        s.reps(10, range: 2.2, up: 1.0, down: 1.4, top: 0.3, bottom: 0.4)
        s.hold(2)
        XCTAssertEqual(s.count(curl).reps, 10)
    }

    func testLateralRaisesAndPushdowns() {
        var s = RepSynth(seed: 14)
        s.rotation = true
        s.hold(1.5)
        s.reps(12, range: 1.4, up: 1.0, down: 1.3)
        s.hold(2)
        XCTAssertEqual(s.count(raise).reps, 12)
        var p = RepSynth(seed: 15)
        p.rotation = true
        p.hold(1.5)
        p.reps(15, range: 1.0, up: 0.7, down: 1.0, top: 0.2, bottom: 0.2)
        p.hold(2)
        XCTAssertEqual(p.count(pushdown).reps, 15)
    }

    func testFacePullsAlongAHorizontalLine() {
        var s = RepSynth(seed: 16)
        s.dir = Vec3(x: cos(0.5), y: sin(0.5), z: 0.1)
        s.hold(2)
        s.reps(12, range: 0.35, up: 0.9, down: 1.1)
        s.hold(2)
        XCTAssertEqual(s.count(facePull).reps, 12)
        var c = RepSynth(seed: 17)
        c.dir = Vec3(x: 0.6, y: 0.3, z: -0.75)
        c.hold(2)
        c.reps(10, range: 0.4, up: 1.0, down: 1.2)
        c.hold(2)
        XCTAssertEqual(c.count(cross).reps, 10)
    }

    func testDifferentTemposAcrossSets() {
        for (i, tempo) in [0.6, 1.0, 1.5, 2.5].enumerated() {
            var s = RepSynth(seed: UInt64(20 + i))
            s.hold(1.5)
            s.reps(8, range: 0.45, up: tempo, down: tempo * 1.3, eccentricFirst: true)
            s.hold(2)
            XCTAssertEqual(s.count(bench).reps, 8, "tempo \(tempo)")
        }
    }

    func testNothingForNinetySecondsGivesUp() {
        var s = RepSynth(seed: 30)
        s.noise = 0.01
        s.hold(91)
        let c = s.count(bench)
        XCTAssertTrue(c.gaveUp)
        XCTAssertEqual(c.reps, 0)
    }

    func testLearningMovesTheThresholdGently() {
        var m = RepMemory()
        m = RepLearning.learn(m, counted: 13, confirmed: 10, peak: 0.5)   // too many: higher
        XCTAssertGreaterThan(m.scale, 1)
        XCTAssertLessThan(m.scale, 1.1)
        XCTAssertEqual(m.sets, 1)
        XCTAssertNil(m.typical)                                          // 30 % off: not learned from
        let up = m.scale
        m = RepLearning.learn(m, counted: 7, confirmed: 10, peak: 0.5)    // too few: lower
        XCTAssertLessThan(m.scale, up)
        m = RepLearning.learn(m, counted: 10, confirmed: 10, peak: 0.6)
        XCTAssertEqual(m.typical ?? 0, 0.6, accuracy: 1e-9)
        let r1: Double = 10.0 / 13
        let r2: Double = r1 + (10.0 / 7 - r1) * 0.3
        let r3: Double = r2 + (1 - r2) * 0.3
        XCTAssertEqual(m.ratio ?? 0, r3, accuracy: 1e-9)
        // never past its bounds, and a set thrown away (0 confirmed) teaches nothing
        var far = RepMemory()
        for _ in 0..<50 { far = RepLearning.learn(far, counted: 30, confirmed: 5, peak: nil) }
        XCTAssertEqual(far.scale, 2.5)
        XCTAssertEqual(RepLearning.learn(far, counted: 10, confirmed: 0, peak: nil), far)
    }

    func testAHigherScaleIgnoresSmallerMoves() {
        var s = RepSynth(seed: 31)
        s.noise = 0.005    // a quiet arm: this is about the threshold, not the noise
        s.hold(1.5)
        s.reps(8, range: 0.1, up: 1.0, down: 1.0, eccentricFirst: true)    // small moves, about 0.16 m/s
        s.hold(2)
        XCTAssertEqual(s.count(bench).reps, 8)
        XCTAssertEqual(s.count(bench, scale: 2).reps, 0)
    }

    func testWorldFrameFromTheAttitude() {
        // The watch turned 90° about x: its y axis points down.
        let r: [Double] = [1, 0, 0, 0, 0, -1, 0, 1, 0]
        let gravityInWatch = Vec3(x: 0, y: -1, z: 0)
        let fits = RepMath.transposeFits(r, gravity: gravityInWatch)
        let down = RepMath.world(r, gravityInWatch, transpose: fits)
        XCTAssertEqual(down.z, -1, accuracy: 1e-9)
        XCTAssertEqual(RepMath.world(r, gravityInWatch, transpose: !fits).z, 1, accuracy: 1e-9)
    }

    func testBiquadPassesSlowAndStopsFast() {
        var lp = Biquad(lowpass: 2.5, fs: 50)
        var slowMax = 0.0, fastMax = 0.0
        for i in 0..<500 {
            let t = Double(i) / 50
            let y = lp.step(sin(2 * Double.pi * 0.5 * t))
            if i > 100 { slowMax = max(slowMax, abs(y)) }
        }
        var lp2 = Biquad(lowpass: 2.5, fs: 50)
        for i in 0..<500 {
            let t = Double(i) / 50
            let y = lp2.step(sin(2 * Double.pi * 12 * t))
            if i > 100 { fastMax = max(fastMax, abs(y)) }
        }
        XCTAssertGreaterThan(slowMax, 0.95)
        XCTAssertLessThan(fastMax, 0.08)
    }
}
