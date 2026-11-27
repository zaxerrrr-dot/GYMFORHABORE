import Foundation

/*
 * The exercises the watch counts reps for (version 1): 30 of the most done barbell, dumbbell and
 * cable lifts, by their catalogue ids (catalogue/exercises/<id>.json). Only lifts that move the
 * wrist: no leg machines, no holds. The same table is in port/rep-counter.mjs (PROFILES) and in
 * docs/LICZENIE-POWTORZEN.md; change all three together.
 *
 * minAmp is the peak speed of half a rep: m/s on the linear axes, rad/s (the wrist turning) on
 * rotation.
 */
enum RepProfiles {
    private static func v(_ minAmp: Double, _ minRep: Double, _ maxRep: Double, _ maxPause: Double, end: Double = 5, oneArm: Bool = false) -> RepProfile {
        RepProfile(axis: .vertical, minAmp: minAmp, minRep: minRep, maxRep: maxRep, maxPause: maxPause, endIdle: end, oneArm: oneArm)
    }
    private static func r(_ minAmp: Double, oneArm: Bool = false) -> RepProfile {
        RepProfile(axis: .rotation, minAmp: minAmp, minRep: 0.8, maxRep: 9, maxPause: 3, endIdle: 5, oneArm: oneArm)
    }

    /// In the order of docs/LICZENIE-POWTORZEN.md: barbell, dumbbells, cable.
    static let ordered: [(id: String, profile: RepProfile)] = [
        // barbell
        ("0025", v(0.10, 0.8, 9, 3.5)),               // bench press
        ("0047", v(0.10, 0.8, 9, 3.5)),               // incline bench press
        ("0043", v(0.10, 1.0, 10, 4)),                // full squat
        ("0032", v(0.10, 1.0, 10, 4, end: 6)),        // deadlift
        ("0085", v(0.09, 1.0, 10, 3.5)),              // Romanian deadlift
        ("1162", v(0.10, 0.8, 9, 3.5)),               // standing military press
        ("0027", v(0.10, 0.7, 7, 3)),                 // bent over row
        ("0031", r(0.40)),                            // curl
        ("0054", v(0.08, 1.0, 10, 4)),                // lunge
        ("0060", r(0.40)),                            // lying triceps extension (skull crusher)
        // dumbbells
        ("0289", v(0.10, 0.8, 9, 3.5)),               // bench press
        ("0314", v(0.10, 0.8, 9, 3.5)),               // incline bench press
        ("0405", v(0.10, 0.8, 9, 3.5)),               // seated shoulder press
        ("0308", r(0.35)),                            // fly
        ("0334", r(0.40)),                            // lateral raise
        ("0294", r(0.40)),                            // biceps curl
        ("0313", r(0.40)),                            // hammer curl
        ("0292", v(0.10, 0.7, 7, 3, oneArm: true)),   // one arm bent-over row
        ("0430", r(0.40)),                            // standing triceps extension (French press)
        ("0336", v(0.08, 1.0, 10, 4)),                // lunge
        ("1760", v(0.10, 1.0, 10, 4)),                // goblet squat
        // cable
        ("0198", v(0.10, 0.8, 8, 3)),                 // pulldown
        ("0861", RepProfile(axis: .horizontal, minAmp: 0.10, minRep: 0.8, maxRep: 8, maxPause: 3, endIdle: 5)), // seated row
        ("2249", r(0.35)),                            // triceps pushdown (V bar)
        ("0200", r(0.35)),                            // pushdown (rope)
        ("5656", RepProfile(axis: .horizontal, minAmp: 0.08, minRep: 0.8, maxRep: 7, maxPause: 3, endIdle: 5)), // face pull (rope)
        ("0155", RepProfile(axis: .dominant, minAmp: 0.08, minRep: 0.8, maxRep: 8, maxPause: 3, endIdle: 5)),   // cross-over
        ("0868", r(0.40)),                            // curl
        ("0178", r(0.40, oneArm: true)),              // lateral raise
        ("0194", r(0.40)),                            // overhead triceps extension (rope)
    ]

    static let byId: [String: RepProfile] = Dictionary(uniqueKeysWithValues: ordered.map { ($0.id, $0.profile) })

    /// The profile for an exercise, or nil when the watch does not count it.
    static func profile(_ exId: String) -> RepProfile? { byId[exId] }
}
