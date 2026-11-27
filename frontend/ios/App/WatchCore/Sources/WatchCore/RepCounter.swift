import Foundation

/*
 * Counting reps on the wrist (Apple Watch, CoreMotion device motion at about 50 Hz, only while a
 * set is being counted). Plain Swift, no CoreMotion here: the watch app (Watch/RepSensor.swift)
 * turns each CMDeviceMotion into a RepSample, this file does the rest, and WatchCoreTests drive it
 * with synthetic signals. frontend/ios/App/WatchCore/port/rep-counter.mjs is the same algorithm in
 * JavaScript, step for step, tested with `node --test` where there is no Mac.
 *
 *   1. one signal per exercise (RepProfile.axis):
 *        vertical    the acceleration along gravity (world z), as a velocity: presses, squats, rows
 *        horizontal  the same in the horizontal plane, along its main direction (PCA of the last
 *                    3 s): cable rows, face pulls
 *        dominant    the main direction in 3D (PCA): cable cross-overs
 *        rotation    the wrist turning: the gyroscope, about the axis it turns about most (PCA):
 *                    curls, lateral raises, flies, triceps extensions
 *   2. a 2nd-order Butterworth low-pass at 2.5 Hz, then for the linear axes a leaky integration
 *      to velocity with a slow mean taken off (a band-pass, about 0.04 to 2.5 Hz): one rep is one
 *      lobe one way and one lobe back (a speed, never a position), whatever the tempo
 *   3. lobes found with hysteresis: a lobe starts past the threshold and ends back under 35 % of it
 *   4. two neighbouring lobes of opposite sign are one rep when the whole rep took between the
 *      profile's shortest and longest rep, the pause between its halves was not too long and the
 *      two halves are of a like size. A lobe left over (the unrack, the first half of a rep that
 *      was never finished) is never counted on its own.
 *   5. the threshold follows the set: never under the profile's minimum (times what the lifter's
 *      corrections taught it, RepLearning), and from the first reps on at least 35 % of the median
 *      size of their smaller halves (a slow eccentric), so the wobbles between reps stay under it
 *   6. the set is over once no rep came for `endIdle` seconds (or twice the set's own rep time,
 *      for slow reps) and the wrist is at rest, or after 15 s without a rep whatever it does;
 *      nothing at all for 90 s and the counting gives up (the battery).
 */

/// A vector, in g (accelerations) or unitless (gravity's direction).
struct Vec3: Equatable, Codable {
    var x: Double
    var y: Double
    var z: Double

    static let zero = Vec3(x: 0, y: 0, z: 0)
    static func + (a: Vec3, b: Vec3) -> Vec3 { Vec3(x: a.x + b.x, y: a.y + b.y, z: a.z + b.z) }
    static func - (a: Vec3, b: Vec3) -> Vec3 { Vec3(x: a.x - b.x, y: a.y - b.y, z: a.z - b.z) }
    static func * (a: Vec3, k: Double) -> Vec3 { Vec3(x: a.x * k, y: a.y * k, z: a.z * k) }
    func dot(_ b: Vec3) -> Double { x * b.x + y * b.y + z * b.z }
    var length: Double { (x * x + y * y + z * z).squareRoot() }
    var unit: Vec3 { let l = length; return l > 1e-12 ? self * (1 / l) : Vec3.zero }
}

/// What the signal of an exercise is (see the header).
enum RepAxis: String, Codable, Equatable {
    case vertical, horizontal, dominant, rotation
}

/// How one exercise moves the wrist.
struct RepProfile: Equatable {
    var axis: RepAxis
    /// The smallest lobe that can be half a rep: m/s for the linear axes, rad/s for rotation.
    var minAmp: Double
    /// A whole rep (both halves) takes at least / at most this many seconds.
    var minRep: Double
    var maxRep: Double
    /// The longest stop between the two halves of one rep (a lockout, a squeeze), in seconds.
    var maxPause: Double
    /// Seconds without motion that end the set.
    var endIdle: Double
    /// Done one arm at a time: the watch must be on the arm that moves.
    var oneArm: Bool = false
}

/// One reading: the motion without gravity in the world's frame (z up, in g) and the rotation
/// rate in the watch's own frame (rad/s, CMDeviceMotion's bias-corrected gyroscope).
struct RepSample: Equatable {
    var t: Double
    var acc: Vec3
    var gyro: Vec3
}

/// A 2nd-order Butterworth low-pass (RBJ's cookbook, Q = 1/√2), direct form II transposed.
struct Biquad {
    private var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    private var z1 = 0.0, z2 = 0.0
    private var primed = false

    init(lowpass fc: Double, fs: Double) {
        let w0 = 2 * Double.pi * min(fc, fs * 0.45) / fs
        let alpha = sin(w0) / (2 * (0.5).squareRoot())
        let c = cos(w0)
        let a0 = 1 + alpha
        b0 = (1 - c) / 2 / a0
        b1 = (1 - c) / a0
        b2 = (1 - c) / 2 / a0
        a1 = -2 * c / a0
        a2 = (1 - alpha) / a0
    }

    mutating func step(_ x: Double) -> Double {
        // The first sample fills the state as if it had always been there (no jump from zero).
        if !primed {
            primed = true
            z1 = x - b0 * x
            z2 = b2 * x - a2 * x
        }
        let y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        return y
    }
}

/// The same low-pass on the three axes.
struct Biquad3 {
    private var x: Biquad
    private var y: Biquad
    private var z: Biquad
    init(lowpass fc: Double, fs: Double) {
        x = Biquad(lowpass: fc, fs: fs); y = Biquad(lowpass: fc, fs: fs); z = Biquad(lowpass: fc, fs: fs)
    }
    mutating func step(_ v: Vec3) -> Vec3 { Vec3(x: x.step(v.x), y: y.step(v.y), z: z.step(v.z)) }
}

/// Acceleration (m/s²) into velocity (m/s) that cannot run away: a leaky integral (`leak` s)
/// with its slow mean (`mean` s) taken off.
struct LeakyVelocity {
    var leak = 4.0
    var mean = 8.0
    private var v = Vec3.zero
    private var m = Vec3.zero
    /// The leaky integral before its mean is taken off: back to about zero as soon as the motion
    /// stops (the band-passed speed takes its slow mean's time).
    var raw: Vec3 { v }

    mutating func step(_ a: Vec3, dt: Double) -> Vec3 {
        let k = exp(-dt / leak)
        v = v * k + a * dt
        m = m + (v - m) * min(1, dt / mean)
        return v - m
    }
}

/// The main direction of the last few seconds of a signal (PCA by power iteration), kept
/// pointing the same way from one update to the next so the signal never flips.
struct PrincipalAxis {
    let size: Int
    let every: Int
    let flat: Bool
    private(set) var axis: Vec3
    private var buf: [Vec3] = []
    private var head = 0
    private var n = 0

    init(size: Int, every: Int, flat: Bool, start: Vec3) {
        self.size = max(4, size)
        self.every = max(1, every)
        self.flat = flat
        axis = start.unit
        buf.reserveCapacity(self.size)
    }

    var ready: Bool { buf.count >= size / 3 }

    mutating func add(_ v0: Vec3) {
        let v = flat ? Vec3(x: v0.x, y: v0.y, z: 0) : v0
        if buf.count < size { buf.append(v) } else { buf[head] = v; head = (head + 1) % size }
        n += 1
        if n % every == 0 && ready { update() }
    }

    private mutating func update() {
        let c = Double(buf.count)
        var mean = Vec3.zero
        for v in buf { mean = mean + v }
        mean = mean * (1 / c)
        var xx = 0.0, xy = 0.0, xz = 0.0, yy = 0.0, yz = 0.0, zz = 0.0
        for v0 in buf {
            let v = v0 - mean
            xx += v.x * v.x; xy += v.x * v.y; xz += v.x * v.z
            yy += v.y * v.y; yz += v.y * v.z; zz += v.z * v.z
        }
        let trace = xx + yy + zz
        guard trace / c > 1e-8 else { return }
        var e = axis
        if e.length < 0.5 { e = flat ? Vec3(x: 1, y: 0, z: 0) : Vec3(x: 0, y: 0, z: 1) }
        for _ in 0..<12 {
            let next = Vec3(x: xx * e.x + xy * e.y + xz * e.z,
                            y: xy * e.x + yy * e.y + yz * e.z,
                            z: xz * e.x + yz * e.y + zz * e.z)
            let l = next.length
            guard l > 1e-15 else { return }
            e = next * (1 / l)
        }
        if e.dot(axis) < 0 { e = e * -1 }
        axis = e
    }
}

/// Half a rep: the signal on one side of zero, past the threshold.
struct RepLobe: Equatable {
    var sign: Int
    var start: Double
    var end: Double
    var peak: Double
}

/// The counter of one set. `add` every sample; `reps` is the count so far.
struct RepCounter {
    let profile: RepProfile
    /// The profile's minimum times the learned scale.
    let base: Double
    private(set) var reps = 0
    /// Each counted rep: when it ended, how long it took and its size (the larger half).
    private(set) var repEnds: [Double] = []
    private(set) var repDurations: [Double] = []
    private(set) var repPeaks: [Double] = []
    /// The smaller half of each rep (the slow eccentric): what the threshold follows.
    private(set) var repSmall: [Double] = []
    private(set) var threshold: Double
    private(set) var ended = false
    /// Nothing at all for this long: the counting gives up.
    private(set) var gaveUp = false

    static let g = 9.80665
    static let hysteresis = 0.35
    static let follow = 0.35
    static let maxQuiet = 15.0
    static let giveUp = 90.0
    static let warmUp = 0.6
    static let otherHalf = 0.2
    static let stillFor = 1.5

    private var lpAcc: Biquad3
    private var lpGyro: Biquad3
    private var vel = LeakyVelocity()
    private var pca: PrincipalAxis
    private var energy = 0.0
    private var rotEnergy = 0.0
    private var lastT: Double?
    private var firstT: Double?
    private var stillSince: Double?
    private var lastRepAt: Double?
    // the lobe being drawn, and the one waiting for its other half
    private var sign = 0
    private var lobeStart = 0.0
    private var lobePeak = 0.0
    private var lobeLow = 0.0
    private var armedAt: Double?
    private var pending: RepLobe?
    /// Every lobe found, for the tests and the test mode's file.
    private(set) var lobes: [RepLobe] = []
    /// The last value of the signal (for the test mode's file).
    private(set) var signal = 0.0

    init(profile: RepProfile, scale: Double = 1, typicalPeak: Double? = nil, fs: Double = 50) {
        self.profile = profile
        base = profile.minAmp * min(2.5, max(0.5, scale))
        threshold = max(base, (typicalPeak ?? 0) * 0.3)
        lpAcc = Biquad3(lowpass: 2.5, fs: fs)
        lpGyro = Biquad3(lowpass: 2.5, fs: fs)
        let size = Int((3 * fs).rounded())
        let start: Vec3 = profile.axis == .horizontal ? Vec3(x: 1, y: 0, z: 0) : Vec3(x: 0, y: 0, z: 1)
        pca = PrincipalAxis(size: size, every: max(1, Int((fs / 4).rounded())), flat: profile.axis == .horizontal, start: start)
    }

    /// The median size of the reps so far.
    var typicalPeak: Double? { RepCounter.median(repPeaks) }

    static func median(_ a: [Double]) -> Double? {
        guard !a.isEmpty else { return nil }
        let s = a.sorted()
        return s.count % 2 == 1 ? s[s.count / 2] : (s[s.count / 2 - 1] + s[s.count / 2]) / 2
    }

    /// One reading. True when it completed a rep.
    @discardableResult
    mutating func add(_ s: RepSample) -> Bool {
        guard !ended, !gaveUp else { return false }
        var dt = 0.02
        if let last = lastT {
            guard s.t > last else { return false }
            dt = min(0.1, s.t - last)
        } else {
            firstT = s.t
        }
        lastT = s.t

        let a = lpAcc.step(s.acc) * RepCounter.g
        let w = lpGyro.step(s.gyro)
        // How much is moving at all (the end of the set).
        let k = min(1, dt / 0.4)
        energy += (a.length - energy) * k
        rotEnergy += (w.length - rotEnergy) * k

        let x: Double
        let speed: Double
        switch profile.axis {
        case .vertical:
            x = vel.step(Vec3(x: 0, y: 0, z: a.z), dt: dt).z
            speed = abs(vel.raw.z)
        case .horizontal, .dominant:
            let v = vel.step(profile.axis == .horizontal ? Vec3(x: a.x, y: a.y, z: 0) : a, dt: dt)
            pca.add(v)
            x = pca.ready ? v.dot(pca.axis) : 0
            speed = vel.raw.length
        case .rotation:
            pca.add(w)
            x = pca.ready ? w.dot(pca.axis) : 0
            speed = abs(x)
        }
        signal = x

        let t = s.t
        let warm = t - (firstT ?? t) >= RepCounter.warmUp
        var counted = false
        if warm { counted = detect(x, t: t) }

        // Still: hardly any acceleration or turning, no lobe being drawn, and no speed either (a
        // slow eccentric of 4 s accelerates less than the sensor's noise, but it moves).
        let still = energy < 0.35 && rotEnergy < 0.35 && sign == 0 && speed < base
        if still { if stillSince == nil { stillSince = t } } else { stillSince = nil }
        if reps > 0, let last = lastRepAt {
            // No rep for the profile's few seconds (twice the set's own rep time when that is
            // longer: slow reps) and the wrist at rest: the set is over. Moving on and on without
            // a rep (walking away) ends it too, a little later.
            let wait = max(profile.endIdle, 2 * (RepCounter.median(repDurations) ?? 0))
            if t - last >= wait, let since = stillSince, t - since >= RepCounter.stillFor { ended = true }
            if t - last >= max(RepCounter.maxQuiet, wait + 5) { ended = true }
        } else if t - (firstT ?? t) >= RepCounter.giveUp {
            gaveUp = true
        }
        return counted
    }

    /// The threshold for a lobe of this sign: after half a rep, its other half (often the slow
    /// eccentric, a far smaller speed) needs less, down to 20 % of the first half.
    private func thresholdFor(_ sgn: Int) -> Double {
        guard let p = pending, p.sign != sgn else { return threshold }
        return max(base * 0.5, min(threshold, p.peak * RepCounter.otherHalf))
    }

    /// The hysteresis and the pairing of lobes into reps.
    private mutating func detect(_ x: Double, t: Double) -> Bool {
        if sign == 0 {
            let sgn = x > 0 ? 1 : -1
            let h = thresholdFor(sgn)
            if abs(x) < h * RepCounter.hysteresis { armedAt = nil } else if armedAt == nil { armedAt = t }
            if abs(x) >= h {
                sign = sgn
                lobeStart = armedAt ?? t
                lobePeak = abs(x)
                lobeLow = h * RepCounter.hysteresis
            }
            return false
        }
        let low = lobeLow
        if Double(sign) * x > lobePeak { lobePeak = Double(sign) * x }
        guard Double(sign) * x < low else { return false }
        let lobe = RepLobe(sign: sign, start: lobeStart, end: t, peak: lobePeak)
        sign = 0
        // Already on the way into the other half: that half starts here.
        armedAt = abs(x) >= low ? t : nil
        // A spike (shorter than a tenth of a second) is no half of a rep.
        guard lobe.end - lobe.start >= 0.1 else { return false }
        lobes.append(lobe)
        if lobes.count > 400 { lobes.removeFirst(lobes.count - 400) }
        if let p = pending, pairs(p, lobe) {
            pending = nil
            count(p, lobe)
            return true
        }
        // A lobe only the lowered threshold let through is the other half of a rep or nothing:
        // it never waits for a half of its own (two wobbles are no rep).
        if lobe.peak >= threshold { pending = lobe }
        return false
    }

    private func pairs(_ a: RepLobe, _ b: RepLobe) -> Bool {
        guard a.sign != b.sign else { return false }
        let gap = b.start - a.end
        let whole = b.end - a.start
        guard gap <= profile.maxPause, whole >= profile.minRep, whole <= profile.maxRep else { return false }
        let ratio = b.peak / max(a.peak, 1e-9)
        guard ratio >= 1.0 / 8, ratio <= 8 else { return false }
        // Once the set has a rhythm, a "rep" far off it is something else (a step, a re-rack).
        if repDurations.count >= 3, let d = RepCounter.median(repDurations) {
            guard whole >= d / 3, whole <= d * 3 else { return false }
        }
        return true
    }

    private mutating func count(_ a: RepLobe, _ b: RepLobe) {
        reps += 1
        repEnds.append(b.end)
        repDurations.append(b.end - a.start)
        repPeaks.append(max(a.peak, b.peak))
        repSmall.append(min(a.peak, b.peak))
        lastRepAt = b.end
        let recent = Array(repSmall.suffix(6))
        threshold = max(base, (RepCounter.median(recent) ?? 0) * RepCounter.follow)
    }
}

/*
 * What the lifter's corrections teach, per exercise, on this watch only: how far off the count
 * was (an average of confirmed / counted) and a scale on the profile's threshold that moves a
 * little after each set: counted too many, it goes up; too few, it goes down. The reps' usual
 * size starts the next set's threshold, once a set was counted right.
 */
struct RepMemory: Codable, Equatable {
    var scale: Double = 1
    var typical: Double? = nil
    var ratio: Double? = nil
    var sets: Int = 0
}

enum RepLearning {
    static let rate = 0.3

    /// After a set: `counted` by the watch, `confirmed` by the lifter, `peak` the reps' median size.
    static func learn(_ m0: RepMemory, counted: Int, confirmed: Int, peak: Double?) -> RepMemory {
        var m = m0
        guard confirmed > 0, counted >= 0 else { return m }
        m.sets += 1
        if counted > 0 {
            let r = Double(confirmed) / Double(counted)
            m.ratio = m.ratio.map { $0 + (r - $0) * rate } ?? r
        }
        // Over-counted: + (a higher threshold); under-counted: − (a lower one).
        let err = max(-1, min(1, Double(counted - confirmed) / Double(max(confirmed, 1))))
        m.scale = max(0.5, min(2.5, m.scale * (1 + rate * err)))
        if let p = peak, p > 0, counted >= 3, abs(err) <= 0.2 {
            m.typical = m.typical.map { $0 + (p - $0) * rate } ?? p
        }
        return m
    }
}

/// CMAttitude's rotation matrix (rows m11 m12 m13 / m21 … / m31 …) and the motion in the world.
enum RepMath {
    /// R·v
    static func times(_ r: [Double], _ v: Vec3) -> Vec3 {
        Vec3(x: r[0] * v.x + r[1] * v.y + r[2] * v.z,
             y: r[3] * v.x + r[4] * v.y + r[5] * v.z,
             z: r[6] * v.x + r[7] * v.y + r[8] * v.z)
    }

    /// Rᵀ·v
    static func timesT(_ r: [Double], _ v: Vec3) -> Vec3 {
        Vec3(x: r[0] * v.x + r[3] * v.y + r[6] * v.z,
             y: r[1] * v.x + r[4] * v.y + r[7] * v.z,
             z: r[2] * v.x + r[5] * v.y + r[8] * v.z)
    }

    /// Which way round the matrix takes the watch's frame to the world's: the one that puts
    /// gravity straight down (0, 0, −1). True: Rᵀ (the usual reading of CMAttitude), false: R.
    static func transposeFits(_ r: [Double], gravity: Vec3) -> Bool {
        let down = Vec3(x: 0, y: 0, z: -1)
        let a = (timesT(r, gravity.unit) - down).length
        let b = (times(r, gravity.unit) - down).length
        return a <= b
    }

    static func world(_ r: [Double], _ v: Vec3, transpose: Bool) -> Vec3 {
        transpose ? timesT(r, v) : times(r, v)
    }
}
