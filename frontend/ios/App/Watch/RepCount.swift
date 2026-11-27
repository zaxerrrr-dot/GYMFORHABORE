import Foundation
import SwiftUI
import WatchKit

/*
 * Counting reps on the wrist (WatchCore RepCounter, RepProfiles), for the 30 exercises with a
 * profile. On the set page "Count reps" starts it (or the set starts it by itself, a setting); the
 * page shows the count big, the wrist taps once per rep, and the set ends after a few still
 * seconds or with Stop. Then "12 reps" waits to be confirmed: the Digital Crown or − + correct it,
 * and Save logs the set exactly as Done does (the weight on the page, these reps), so it reaches
 * the iPhone and the server the same way. Nothing new is sent: the phone sees a set done.
 *
 * Each correction teaches the exercise's threshold a little (RepLearning, on this watch only).
 * The settings are the watch's own (RepSettings, the start screen's "Rep counter").
 */

/// The watch's own settings for the counter (UserDefaults, the start screen's Rep counter).
enum RepSettings {
    static let onKey = "repCount.on"
    static let autoKey = "repCount.auto"
    static let testKey = "repCount.test"

    /// "Automatic rep counting" for the exercises on the list (on).
    static var on: Bool { UserDefaults.standard.object(forKey: onKey) as? Bool ?? true }
    /// Counting starts by itself when a set comes up (off: the button).
    static var auto: Bool { UserDefaults.standard.bool(forKey: autoKey) }
    /// "Counting test mode": each set's readings kept as a file (off).
    static var test: Bool { UserDefaults.standard.bool(forKey: testKey) }
}

/// What the corrections taught, per exercise id (RepMemory), on this watch.
enum RepMemories {
    private static let key = "repCount.memory"

    static func all() -> [String: RepMemory] {
        guard let d = UserDefaults.standard.data(forKey: key),
              let v = try? JSONDecoder().decode([String: RepMemory].self, from: d) else { return [:] }
        return v
    }

    static func get(_ exId: String) -> RepMemory { all()[exId] ?? RepMemory() }

    static func set(_ exId: String, _ m: RepMemory) {
        var a = all()
        a[exId] = m
        if let d = try? JSONEncoder().encode(a) { UserDefaults.standard.set(d, forKey: key) }
    }

    static func reset() { UserDefaults.standard.removeObject(forKey: key) }
}

/// The set being counted, or waiting to be confirmed.
struct RepLive: Equatable {
    enum Phase: Equatable { case counting, confirm }
    var exId: String
    var name: String
    var wid: String?
    var ref: SetRef
    var side: String?
    var oneArm: Bool
    var phase: Phase = .counting
    /// What the watch counted, and what the confirmation shows (the crown and − + change it).
    var counted: Int = 0
    var confirmed: Int = 0
    /// The reps' usual size and the threshold at the end, from the counter (RepLearning, test mode).
    var typical: Double?
    var threshold: Double = 0
}

extension SessionStore {
    /// The profile for an exercise on the set page, when the counter is on and the set has reps.
    func repProfile(_ e: Entry?) -> RepProfile? {
        guard RepSettings.on, let e = e, !e.isTimed, !e.isCardio else { return nil }
        return RepProfiles.profile(e.id)
    }

    /// The wrist the watch is on, as a side of a per-side set ("L" or "R").
    var wristSide: String { WKInterfaceDevice.current().wristLocation == .left ? "L" : "R" }

    /// Whether the set page may offer "Count reps" now: the set up next of a listed exercise,
    /// nothing else running, and for a one-arm lift done per side, the side the watch is on.
    var canCountReps: Bool {
        guard repLive == nil, workout != nil, viewing == nil, holdEndsAt == nil, holdCountFrom == nil, !restPanel,
              let e = entry, setIndex != nil, let p = repProfile(e), repSensor.available else { return false }
        if p.oneArm, let side = sideUp, side != wristSide { return false }
        return true
    }

    /// Counting starts: by the button, or by itself on a set that came up (`auto`).
    func startRepCount(auto: Bool = false) {
        guard canCountReps, let w = workout, let e = entry, let si = setIndex, let p = repProfile(e) else { return }
        let ref = SetRef(entry: entryIndex, set: si)
        let key = "\(w.id ?? "")|\(ref.entry)|\(ref.set)|\(sideUp ?? "")"
        if auto {
            // Once per set: after a Cancel the set page stays as it is.
            guard RepSettings.auto, repAutoFor != key else { return }
        }
        repAutoFor = key
        let m = RepMemories.get(e.id)
        let live = RepLive(exId: e.id, name: e.name, wid: w.id, ref: ref, side: sideUp, oneArm: p.oneArm)
        let started = repSensor.start(profile: p, scale: m.scale, typical: m.typical, record: RepSettings.test) { [weak self] u in
            self?.repUpdate(u)
        }
        guard started else { return }
        ackRestOver()
        repLive = live
        if !auto { WKInterfaceDevice.current().play(.start) }
    }

    /// A rep (a tap on the wrist), or the set is over by itself.
    private func repUpdate(_ u: RepSensor.Update) {
        guard var live = repLive, live.phase == .counting else { return }
        if u.reps != live.counted {
            live.counted = u.reps
            repLive = live
            WKInterfaceDevice.current().play(.click)
        }
        if u.gaveUp && live.counted == 0 {
            // A minute and a half with no rep: nothing to confirm, the page as it was.
            cancelRepCount()
        } else if u.ended || u.gaveUp {
            stopRepCount()
        }
    }

    /// Stop (or the set's end): the count waits to be confirmed (0 too: − + can still set it).
    func stopRepCount() {
        guard let live = repLive, live.phase == .counting else { return }
        repSensor.stop { [weak self] result in
            guard let self = self, var now = self.repLive, now.phase == .counting, now.ref == live.ref else { return }
            now.counted = max(now.counted, result.reps)
            now.confirmed = now.counted
            now.typical = result.typical
            now.threshold = result.threshold
            now.phase = .confirm
            self.repLines = result.lines
            self.repLive = now
            Haptics.done()
        }
    }

    /// − or + (or the crown) on the confirmation.
    func setConfirmedReps(_ n: Int) {
        guard var live = repLive, live.phase == .confirm else { return }
        live.confirmed = min(200, max(0, n))
        repLive = live
    }

    /// Save: the set is logged with these reps, as Done logs it, and the exercise learns from the correction.
    func confirmRepCount() {
        guard let live = repLive, live.phase == .confirm else { return }
        let m = RepLearning.learn(RepMemories.get(live.exId), counted: live.counted, confirmed: live.confirmed, peak: live.typical)
        if live.confirmed > 0 { RepMemories.set(live.exId, m) }
        writeRepSamples(live, confirmed: live.confirmed)
        repLive = nil
        // The same set still up (the phone did not tick it meanwhile): logged; otherwise nothing.
        guard live.confirmed > 0, workout?.id == live.wid, viewing == nil, let si = setIndex,
              entryIndex == live.ref.entry, si == live.ref.set, sideUp == live.side else { return }
        reps = Double(live.confirmed)
        completeSet()
    }

    /// The counting is dropped: nothing logged, nothing learned (the readings still kept in test mode).
    func cancelRepCount(record: Bool = true) {
        guard let live = repLive else { return }
        repLive = nil
        if live.phase == .counting {
            repSensor.stop { [weak self] result in
                guard record else { return }
                self?.repLines = result.lines
                self?.writeRepSamples(live, confirmed: nil)
            }
        } else if record {
            writeRepSamples(live, confirmed: nil)
        }
    }

    private func writeRepSamples(_ live: RepLive, confirmed: Int?) {
        defer { repLines = nil }
        guard let lines = repLines, !lines.isEmpty else { return }
        let p = RepProfiles.profile(live.exId)
        let m = RepMemories.get(live.exId)
        let axis: String = p?.axis.rawValue ?? "?"
        let said: String = confirmed.map { String($0) } ?? "cancelled"
        let side: String = live.side ?? "-"
        let scale: String = String(format: "%.3f", m.scale)
        let threshold: String = String(format: "%.4f", live.threshold)
        let version: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        var header = "# exId=\(live.exId) axis=\(axis) counted=\(live.counted) confirmed=\(said)"
        header += " wrist=\(wristSide) side=\(side) scale=\(scale) threshold=\(threshold)"
        header += " rate=\(Int(RepSensor.rate)) app=\(version)"
        RepSamples.write(lines, header: header, exId: live.exId)
    }

    /// A set that came up with the setting on: counting starts by itself.
    func autoRepCountIfDue() {
        guard RepSettings.auto, tab == .set else { return }
        startRepCount(auto: true)
    }
}
