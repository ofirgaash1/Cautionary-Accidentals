//==============================================
//  Score Simplifier
//  Reworked from Cautionary Accidentals template
//==============================================

function runPlugin(mode) {
    if (!curScore) {
        return
    }

    curScore.startCmd()
    var fullScoreSelected = false

    if (!curScore.selection.elements.length) {
        console.log("No selection found. Processing full score.")
        cmd("select-all")
        fullScoreSelected = true
    } else {
        console.log("Processing current selection.")
    }

    switch (mode) {
        case "normalize":
            normalizeVoices()
            normalizeDurations()
            break
        case "voices":
            normalizeVoices()
            break
        case "durations":
            normalizeDurations()
            break
        default:
            console.warn("Unknown mode: " + mode)
    }

    if (fullScoreSelected) {
        curScore.selection.clear()
    }
    curScore.endCmd()
}

function normalizeVoices() {
    // Convert all selected voices in each staff to the primary voice.
    cmd("voice-assignment-all-in-staff")
}

function normalizeDurations() {
    // Regroup rhythms in selection:
    // - merges straightforward ties (e.g. quarter+quarter -> half)
    // - merges adjacent short values (e.g. eighth+eighth -> quarter)
    // - keeps metric boundaries (e.g. 4/4 half-bar split) as ties when needed
    cmd("reset-groupings")
}
