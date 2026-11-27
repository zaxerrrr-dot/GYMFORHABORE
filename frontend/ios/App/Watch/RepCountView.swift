import SwiftUI
import WatchConnectivity
import WatchKit

/*
 * The rep counter's screens (RepCount.swift): the count while the set runs, big, with Stop; then
 * the count to confirm, the Digital Crown or − + to correct it, and Save. Plus the counter's
 * settings, from the start screen.
 */

/// On the set page, in place of the set while it is counted or confirmed.
struct RepCountView: View {
    @EnvironmentObject var store: SessionStore

    var body: some View {
        if let live = store.repLive {
            switch live.phase {
            case .counting: RepCountingView(live: live)
            case .confirm: RepConfirmView(live: live)
            }
        }
    }
}

struct RepCountingView: View {
    @EnvironmentObject var store: SessionStore
    let live: RepLive
    @Environment(\.accent) private var accent
    @Environment(\.isLuminanceReduced) private var dimmed

    var body: some View {
        VStack(spacing: 2) {
            Text(verbatim: live.name)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 8)
            Spacer(minLength: 0)
            Text(verbatim: "\(live.counted)")
                .font(.system(size: 80, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(accent.opacity(dimmed ? 0.7 : 1))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText())
                .animation(dimmed ? nil : .easeOut(duration: 0.15), value: live.counted)
                .accessibilityLabel(Text("Counting reps"))
                .accessibilityValue(Text(verbatim: "\(live.counted)"))
            Text("Counting reps")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(Theme.label2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if live.oneArm {
                Text("Wear the watch on the arm that moves.")
                    .font(.system(size: 12, design: .rounded))
                    .foregroundStyle(Theme.orange)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                EdgeButton(systemImage: "xmark", label: Text("Cancel")) { store.cancelRepCount() }
                Button { store.stopRepCount() } label: {
                    Label { Text("Stop") } icon: { Image(systemName: "stop.fill") }
                }
                .buttonStyle(PrimaryButtonStyle())
            }
        }
        .padding(.horizontal, 2)
    }
}

/// "12 reps": the crown or − + correct it, Save logs the set.
struct RepConfirmView: View {
    @EnvironmentObject var store: SessionStore
    let live: RepLive
    @State private var index = 0
    @FocusState private var crown: Bool
    @Environment(\.accent) private var accent
    @Environment(\.isLuminanceReduced) private var dimmed

    var body: some View {
        VStack(spacing: 4) {
            Text("Reps counted")
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 8)
            HStack(spacing: 4) {
                step(-1, "minus", Text("One fewer"))
                Text(verbatim: "\(live.confirmed)")
                    .font(.system(size: 64, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(accent.opacity(dimmed ? 0.7 : 1))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .contentTransition(.numericText())
                    .frame(maxWidth: .infinity)
                    .focusable()
                    .focusEffectDisabled()
                    .focused($crown)
                    .digitalCrownRotation(detent: $index, from: 0, through: 200, by: 1,
                                          sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                    .onAppear { index = live.confirmed; crown = true }
                    .onChange(of: index) { i in if i != store.repLive?.confirmed { store.setConfirmedReps(i) } }
                    .onChange(of: live.confirmed) { v in if v != index { index = v } }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Text("Reps"))
                    .accessibilityValue(Text(verbatim: "\(live.confirmed)"))
                    .accessibilityHint(Text("Turn the Digital Crown to change it."))
                    .accessibilityAdjustableAction { d in
                        switch d {
                        case .increment: store.setConfirmedReps(live.confirmed + 1)
                        case .decrement: store.setConfirmedReps(live.confirmed - 1)
                        @unknown default: break
                        }
                    }
                step(1, "plus", Text("One more"))
            }
            .frame(maxHeight: .infinity)
            Text("Reps")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(Theme.label2)
            HStack(spacing: 6) {
                EdgeButton(systemImage: "xmark", label: Text("Cancel")) { store.cancelRepCount() }
                Button { store.confirmRepCount() } label: {
                    Label { Text("Save") } icon: { Image(systemName: "checkmark") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(live.confirmed == 0)
            }
        }
        .padding(.horizontal, 2)
    }

    private func step(_ d: Int, _ symbol: String, _ label: Text) -> some View {
        Button {
            store.setConfirmedReps(live.confirmed + d)
            WKInterfaceDevice.current().play(.click)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.white.opacity(dimmed ? 0.6 : 1))
                .frame(width: 34, height: 34)
                .glass(Circle(), fill: dimmed ? Color.clear : Theme.surface2, dimmed: dimmed)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// "Count reps" on the set page, beside the set's tags.
struct CountRepsButton: View {
    @EnvironmentObject var store: SessionStore
    @Environment(\.accent) private var accent
    @Environment(\.isLuminanceReduced) private var dimmed

    var body: some View {
        Button { store.startRepCount() } label: {
            Label { Text("Count reps") } icon: { Image(systemName: "waveform.path") }
                .font(.system(.caption2, design: .rounded).weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(accent)
                .padding(.horizontal, 8)
                .frame(minHeight: 24)
                .glass(Capsule(), tint: accent.opacity(0.35), fill: accent.opacity(0.18), dimmed: dimmed)
        }
        .buttonStyle(.plain)
    }
}

/// The counter's settings, from the start screen: on, by itself with each set, the test mode.
struct RepSettingsView: View {
    @AppStorage(RepSettings.onKey) private var on = true
    @AppStorage(RepSettings.autoKey) private var auto = false
    @AppStorage(RepSettings.testKey) private var test = false
    @State private var files = 0
    @State private var sent = false
    @State private var nothing = false

    var body: some View {
        List {
            Section {
                Toggle(isOn: $on) { Text("Automatic rep counting") }
            } footer: {
                Text("Counts reps for 30 barbell, dumbbell and cable exercises.")
            }
            Section {
                Toggle(isOn: $auto) { Text("Start with each set") }.disabled(!on)
            } footer: {
                Text("Off: start it with Count reps on the set page.")
            }
            Section {
                Toggle(isOn: $test) { Text("Counting test mode") }
                if test || files > 0 {
                    Text("Samples: \(Int64(files))").foregroundStyle(Theme.label2)
                    Button { send() } label: { Text("Send samples to iPhone") }
                    Button(role: .destructive) { RepSamples.deleteAll(); files = 0; sent = false } label: { Text("Delete samples") }
                }
                if sent { Text("Sent. On a Mac: Finder › iPhone › Files › Habcore Gym.").font(.footnote).foregroundStyle(Theme.label2) }
                if nothing { Text("Nothing to send yet.").font(.footnote).foregroundStyle(Theme.label2) }
            } footer: {
                Text("Keeps each set's motion as a file, to tune the counter.")
            }
            Section {
                Button(role: .destructive) { RepMemories.reset() } label: { Text("Forget corrections") }
            }
        }
        .navigationTitle(Text("Rep counter"))
        .onAppear { files = RepSamples.files().count }
    }

    private func send() {
        let list = RepSamples.files()
        guard !list.isEmpty, WCSession.isSupported(), WCSession.default.activationState == .activated else {
            nothing = list.isEmpty
            return
        }
        for f in list {
            WCSession.default.transferFile(f, metadata: ["kind": "repSamples", "name": f.lastPathComponent])
        }
        nothing = false
        sent = true
    }
}
