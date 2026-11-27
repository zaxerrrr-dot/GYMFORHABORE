import CoreMotion
import Foundation

/*
 * The wrist's motion for the rep counter (WatchCore RepCounter), only while a set is counted:
 * CoreMotion's device motion at 50 Hz (sensor fusion: the motion without gravity, the attitude,
 * the bias-corrected gyroscope), turned into the world's frame here and counted on a queue of its
 * own, off the main thread. Stopped the moment the set is over, given up or cancelled, so the
 * sensors never run between sets. With Apple Health on, the workout session keeps the app (and
 * with it these updates) running with the wrist down.
 *
 * Test mode (Settings on the watch, off by default): every reading of the set is kept and, once
 * the set is confirmed, written as a CSV file to Documents/RepSamples (the newest 30 are kept),
 * to be sent to the iPhone from the same settings screen (RepSettingsView, Send samples).
 */
final class RepSensor {
    /// What the counter says, on the main thread: the reps so far, whether the set is over.
    struct Update {
        let reps: Int
        let ended: Bool
        let gaveUp: Bool
    }

    /// One set's counting: its counter and its readings, only touched on `queue`.
    private final class Run {
        var counter: RepCounter
        var transpose: Bool?
        var t0: TimeInterval?
        var lines: [String]?
        var reps = 0
        var over = false
        init(counter: RepCounter, record: Bool) {
            self.counter = counter
            lines = record ? [] : nil
        }
    }

    /// What one set came to, for the confirmation and RepLearning.
    struct Result {
        let reps: Int
        let typical: Double?
        let lines: [String]?
        let threshold: Double
    }

    static let rate = 50.0
    /// About five minutes of readings at most in one test-mode file.
    private static let maxLines = 15_000

    private let manager = CMMotionManager()
    private let queue: OperationQueue = {
        let q = OperationQueue()
        q.maxConcurrentOperationCount = 1
        q.qualityOfService = .userInitiated
        q.name = "pl.habcore.gym.reps"
        return q
    }()
    private var run: Run?

    var available: Bool { manager.isDeviceMotionAvailable }
    var running: Bool { run != nil }

    /// Starts counting a set. `update` is called on the main thread after each rep and when the
    /// set is over. False when the watch has no device motion.
    func start(profile: RepProfile, scale: Double, typical: Double?, record: Bool, update: @escaping (Update) -> Void) -> Bool {
        guard manager.isDeviceMotionAvailable else { return false }
        if manager.isDeviceMotionActive { manager.stopDeviceMotionUpdates() }
        let r = Run(counter: RepCounter(profile: profile, scale: scale, typicalPeak: typical, fs: RepSensor.rate), record: record)
        run = r
        manager.deviceMotionUpdateInterval = 1 / RepSensor.rate
        manager.startDeviceMotionUpdates(to: queue) { motion, _ in
            guard let m = motion, !r.over else { return }
            RepSensor.take(m, into: r, update: update)
        }
        return true
    }

    /// Stops the sensor and hands over what the set came to (on the main thread).
    func stop(_ done: @escaping (Result) -> Void) {
        manager.stopDeviceMotionUpdates()
        guard let r = run else {
            done(Result(reps: 0, typical: nil, lines: nil, threshold: 0))
            return
        }
        run = nil
        // After the readings already queued: the count is the one the screen showed.
        queue.addOperation {
            r.over = true
            let result = Result(reps: r.counter.reps, typical: r.counter.typicalPeak, lines: r.lines, threshold: r.counter.threshold)
            DispatchQueue.main.async { done(result) }
        }
    }

    /// One reading, on `queue`.
    private static func take(_ m: CMDeviceMotion, into r: Run, update: @escaping (Update) -> Void) {
        let a = m.attitude.rotationMatrix
        let rot = [a.m11, a.m12, a.m13, a.m21, a.m22, a.m23, a.m31, a.m32, a.m33]
        let user = Vec3(x: m.userAcceleration.x, y: m.userAcceleration.y, z: m.userAcceleration.z)
        let gravity = Vec3(x: m.gravity.x, y: m.gravity.y, z: m.gravity.z)
        let gyro = Vec3(x: m.rotationRate.x, y: m.rotationRate.y, z: m.rotationRate.z)
        // Which way the matrix goes, from the first reading: the one that puts gravity down.
        if r.transpose == nil { r.transpose = RepMath.transposeFits(rot, gravity: gravity) }
        let world = RepMath.world(rot, user, transpose: r.transpose ?? true)
        if r.t0 == nil { r.t0 = m.timestamp }
        let t = m.timestamp - (r.t0 ?? m.timestamp)
        let wasOver = r.counter.ended || r.counter.gaveUp
        let counted = r.counter.add(RepSample(t: t, acc: world, gyro: gyro))
        if r.lines != nil, (r.lines?.count ?? 0) < maxLines {
            r.lines?.append(String(format: "%.3f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.4f,%ld",
                                   t, world.x, world.y, world.z, gyro.x, gyro.y, gyro.z,
                                   user.x, user.y, user.z, gravity.x, gravity.y, gravity.z,
                                   r.counter.signal, r.counter.reps))
        }
        let over = r.counter.ended || r.counter.gaveUp
        if counted || (over && !wasOver) {
            r.reps = r.counter.reps
            let u = Update(reps: r.counter.reps, ended: r.counter.ended, gaveUp: r.counter.gaveUp)
            DispatchQueue.main.async { update(u) }
        }
    }
}

/// The test mode's files: written after a set, listed, sent to the iPhone, deleted.
enum RepSamples {
    static var dir: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("RepSamples")
    }
    static let keep = 30

    /// `header`: one line of what the set was (exercise, counted, confirmed, …), as "# key=value …".
    static func write(_ lines: [String], header: String, exId: String) {
        let fm = FileManager.default
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let stamp: String = {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "yyyyMMdd-HHmmss"
            return f.string(from: Date())
        }()
        let name = "reps-\(stamp)-\(exId.replacingOccurrences(of: "/", with: "_")).csv"
        let text = ([header, "t,ax,ay,az,gx,gy,gz,ux,uy,uz,grx,gry,grz,signal,reps"] + lines).joined(separator: "\n") + "\n"
        try? text.data(using: .utf8)?.write(to: dir.appendingPathComponent(name), options: .atomic)
        let all = files()
        if all.count > keep {
            for old in all.prefix(all.count - keep) { try? fm.removeItem(at: old) }
        }
    }

    /// The files, oldest first.
    static func files() -> [URL] {
        let list = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return list.filter { $0.pathExtension == "csv" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    static func deleteAll() {
        for f in files() { try? FileManager.default.removeItem(at: f) }
    }
}
