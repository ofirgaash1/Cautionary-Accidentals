//==============================================
//  Score Simplifier
//  Reworked from Cautionary Accidentals template
//==============================================

var MAX_UPPER_STAFF_SPAN_SEMITONES = 16
var MAX_HAND_RANGE_SEMITONES = 12

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

    var measureTicksFilter = collectSelectedMeasureTicks(fullScoreSelected)

    switch (mode) {
        case "normalize":
            normalizeVoices(measureTicksFilter)
            normalizeDurations()
            break
        case "voices":
            normalizeVoices(measureTicksFilter)
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

function normalizeVoices(measureTicksFilter) {
    var result = rewriteSelectedMeasuresToSingleVoice(measureTicksFilter)
    applySpellingRequests(result.spellingRequests)
    applyTieRequests(result.tieRequests)
    cleanupEmptySecondaryVoiceRests(measureTicksFilter)
}

function normalizeDurations() {
    cmd("reset-groupings")
}

function collectSelectedMeasureTicks(fullScoreSelected) {
    if (fullScoreSelected) {
        return null
    }

    var measureTicks = {}
    for (var i in curScore.selection.elements) {
        var measure = parentMeasureOf(curScore.selection.elements[i])
        if (measure && measure.firstSegment) {
            measureTicks[measure.firstSegment.tick] = true
        }
    }

    return Object.keys(measureTicks).length ? measureTicks : null
}

function parentMeasureOf(element) {
    var node = element
    var safety = 0
    while (node && safety < 24) {
        if (node.type == Element.MEASURE) {
            return node
        }
        node = node.parent
        safety++
    }
    return null
}

function rewriteSelectedMeasuresToSingleVoice(measureTicksFilter) {
    var tieRequests = []
    var spellingRequests = []

    for (var measure = curScore.firstMeasure; measure; measure = measure.nextMeasure) {
        if (!measure.firstSegment) {
            continue
        }

        var measureStart = measure.firstSegment.tick
        if (measureTicksFilter && !measureTicksFilter[measureStart]) {
            continue
        }

        if (measureContainsTuplets(measure)) {
            console.warn("Skipping tuplet measure at tick " + measureStart + " (voice rewrite disabled to preserve exact rhythm).")
            continue
        }

        var measureEnd = getMeasureEndTick(measure)
        var analysis = analyzeMeasureForRewrite(measure, measureStart, measureEnd)
        if (!analysis.hasAnyRecords) {
            continue
        }

        for (var staffIdx = 0; staffIdx < curScore.nstaves; staffIdx++) {
            rewriteMeasureStaffVoices(
                measure,
                staffIdx,
                measureStart,
                measureEnd,
                analysis.eventsByStaff[staffIdx],
                analysis.incomingPitchMap,
                analysis.outgoingPitchMap,
                spellingRequests,
                tieRequests
            )
        }
    }

    return {
        tieRequests: tieRequests,
        spellingRequests: spellingRequests
    }
}

function analyzeMeasureForRewrite(measure, measureStart, measureEnd) {
    var recordsByStaff = []
    var allRecords = []
    var hasAnyRecords = false

    for (var staffIdx = 0; staffIdx < curScore.nstaves; staffIdx++) {
        var staffRecords = collectVoiceChordRecords(measure, staffIdx, measureStart, measureEnd)
        recordsByStaff.push(staffRecords)
        if (staffRecords.length) {
            hasAnyRecords = true
            for (var r in staffRecords) {
                allRecords.push(staffRecords[r])
            }
        }
    }

    var incomingPitchMap = {}
    var outgoingPitchMap = {}
    for (var i in allRecords) {
        var rec = allRecords[i]
        if (rec.start == measureStart) {
            for (var inPitch in rec.tieStopByPitch) {
                incomingPitchMap[inPitch] = true
            }
        }
        if (rec.end == measureEnd) {
            for (var outPitch in rec.tieStartByPitch) {
                outgoingPitchMap[outPitch] = true
            }
        }
    }

    var boundaries = {}
    boundaries[measureStart] = true
    boundaries[measureEnd] = true
    for (var j in allRecords) {
        boundaries[allRecords[j].start] = true
        boundaries[allRecords[j].end] = true
    }

    var sortedBoundaries = []
    for (var tick in boundaries) {
        sortedBoundaries.push(parseInt(tick, 10))
    }
    sortedBoundaries.sort(function (a, b) { return a - b })

    var intervals = []
    for (var b = 0; b < sortedBoundaries.length - 1; b++) {
        var start = sortedBoundaries[b]
        var end = sortedBoundaries[b + 1]
        if (end <= start) {
            continue
        }

        var pitchesByStaff = []
        for (var s = 0; s < curScore.nstaves; s++) {
            pitchesByStaff.push(activePitchesAtTick(recordsByStaff[s], start))
        }

        var tpcByPitch = activeTpcByPitchAtTick(allRecords, start)

        rebalancePitchesAcrossAdjacentStaves(pitchesByStaff, MAX_UPPER_STAFF_SPAN_SEMITONES)

        intervals.push({
            start: start,
            end: end,
            pitchesByStaff: pitchesByStaff,
            tpcByPitch: tpcByPitch
        })
    }

    var eventsByStaff = []
    for (var staff = 0; staff < curScore.nstaves; staff++) {
        eventsByStaff.push([])
    }

    for (var k = 0; k < intervals.length; k++) {
        var interval = intervals[k]

        for (var staffIdx2 = 0; staffIdx2 < curScore.nstaves; staffIdx2++) {
            var intervalPitches = interval.pitchesByStaff[staffIdx2]
            var tieMap = {}
            var eventTpcByPitch = {}
            for (var p = 0; p < intervalPitches.length; p++) {
                var pitch = intervalPitches[p]
                tieMap[pitch] = { start: false, stop: false }
                if (interval.tpcByPitch[pitch] !== undefined) {
                    eventTpcByPitch[pitch] = interval.tpcByPitch[pitch]
                }
            }
            eventsByStaff[staffIdx2].push({
                start: interval.start,
                end: interval.end,
                pitches: intervalPitches,
                ties: tieMap,
                tpcByPitch: eventTpcByPitch
            })
        }
    }

    for (var ix = 0; ix < intervals.length - 1; ix++) {
        var left = intervals[ix]
        var right = intervals[ix + 1]
        var boundaryTick = right.start
        if (left.end != boundaryTick) {
            continue
        }

        for (var st = 0; st < curScore.nstaves; st++) {
            var leftPitches = toPitchMap(left.pitchesByStaff[st])
            var rightPitches = toPitchMap(right.pitchesByStaff[st])
            for (var pitchKey in leftPitches) {
                if (rightPitches[pitchKey] && shouldTiePitchAtBoundary(allRecords, parseInt(pitchKey, 10), boundaryTick)) {
                    eventsByStaff[st][ix].ties[pitchKey].start = true
                    eventsByStaff[st][ix + 1].ties[pitchKey].stop = true
                }
            }
        }
    }

    return {
        hasAnyRecords: hasAnyRecords,
        eventsByStaff: eventsByStaff,
        incomingPitchMap: incomingPitchMap,
        outgoingPitchMap: outgoingPitchMap
    }
}

function activePitchesAtTick(records, tick) {
    var pitchMap = {}
    for (var i in records) {
        var rec = records[i]
        if (rec.start <= tick && rec.end > tick) {
            for (var p in rec.pitchMap) {
                pitchMap[p] = true
            }
        }
    }

    var pitches = []
    for (var k in pitchMap) {
        pitches.push(parseInt(k, 10))
    }
    pitches.sort(function (a, b) { return a - b })
    return pitches
}

function activeTpcByPitchAtTick(records, tick) {
    var tpcByPitch = {}

    for (var i in records) {
        var rec = records[i]
        if (rec.start <= tick && rec.end > tick) {
            for (var pitch in rec.tpcByPitch) {
                if (tpcByPitch[pitch] === undefined) {
                    tpcByPitch[pitch] = rec.tpcByPitch[pitch]
                }
            }
        }
    }

    return tpcByPitch
}

function rebalancePitchesAcrossAdjacentStaves(pitchesByStaff, maxUpperSpanSemitones) {
    for (var upperIdx = 0; upperIdx < pitchesByStaff.length - 1; upperIdx++) {
        var lowerIdx = upperIdx + 1
        rebalanceStaffPair(pitchesByStaff[upperIdx], pitchesByStaff[lowerIdx], maxUpperSpanSemitones)
    }
}

function rebalanceStaffPair(upperPitches, lowerPitches, maxUpperSpanSemitones) {
    upperPitches.sort(function (a, b) { return a - b })
    lowerPitches.sort(function (a, b) { return a - b })

    while (upperPitches.length > 1 && pitchRangeSemitones(upperPitches) > maxUpperSpanSemitones) {
        moveLowestPitchDown(upperPitches, lowerPitches)
    }

    while (upperPitches.length && lowerPitches.length && upperPitches[0] < lowerPitches[lowerPitches.length - 1]) {
        moveLowestPitchDown(upperPitches, lowerPitches)
    }

    rebalanceByBorrowing(upperPitches, lowerPitches, MAX_HAND_RANGE_SEMITONES)

    while (upperPitches.length && lowerPitches.length && upperPitches[0] < lowerPitches[lowerPitches.length - 1]) {
        moveLowestPitchDown(upperPitches, lowerPitches)
    }
}

function rebalanceByBorrowing(upperPitches, lowerPitches, maxHandRangeSemitones) {
    var safety = 32

    while (safety > 0) {
        safety--

        var upperRange = pitchRangeSemitones(upperPitches)
        var lowerRange = pitchRangeSemitones(lowerPitches)

        if (upperRange <= maxHandRangeSemitones && lowerRange <= maxHandRangeSemitones) {
            break
        }

        if (upperRange > maxHandRangeSemitones && lowerRange > maxHandRangeSemitones) {
            break
        }

        if (upperRange > maxHandRangeSemitones && lowerRange <= maxHandRangeSemitones) {
            if (upperPitches.length <= 1) {
                break
            }
            moveLowestPitchDown(upperPitches, lowerPitches)
            continue
        }

        if (lowerRange > maxHandRangeSemitones && upperRange <= maxHandRangeSemitones) {
            if (lowerPitches.length <= 1) {
                break
            }
            moveHighestPitchUp(lowerPitches, upperPitches)
            continue
        }

        break
    }
}

function pitchRangeSemitones(pitches) {
    if (pitches.length <= 1) {
        return 0
    }
    return pitches[pitches.length - 1] - pitches[0]
}

function moveLowestPitchDown(upperPitches, lowerPitches) {
    if (!upperPitches.length) {
        return
    }
    var moved = upperPitches.shift()
    lowerPitches.push(moved)
    lowerPitches.sort(function (a, b) { return a - b })
}

function moveHighestPitchUp(lowerPitches, upperPitches) {
    if (!lowerPitches.length) {
        return
    }
    var moved = lowerPitches.pop()
    upperPitches.push(moved)
    upperPitches.sort(function (a, b) { return a - b })
}
function toPitchMap(pitches) {
    var map = {}
    for (var i = 0; i < pitches.length; i++) {
        map[pitches[i]] = true
    }
    return map
}

function getMeasureEndTick(measure) {
    if (measure.nextMeasure && measure.nextMeasure.firstSegment) {
        return measure.nextMeasure.firstSegment.tick
    }

    if (measure.tick && measure.ticks && measure.tick.ticks !== undefined && measure.ticks.ticks !== undefined) {
        return measure.tick.ticks + measure.ticks.ticks
    }

    var maxTick = measure.firstSegment ? measure.firstSegment.tick : 0
    forEachMeasureSegment(measure, function (segment) {
        if (segment.tick > maxTick) {
            maxTick = segment.tick
        }
    })
    return maxTick + 1
}

function forEachMeasureSegment(measure, callback) {
    for (var segment = measure.firstSegment; segment; segment = segment.nextInMeasure) {
        callback(segment)
        if (segment.is(measure.lastSegment)) {
            break
        }
    }
}

function measureContainsTuplets(measure) {
    var hasTuplets = false

    forEachMeasureSegment(measure, function (segment) {
        if (hasTuplets) {
            return
        }

        for (var track = 0; track < curScore.ntracks; track++) {
            var element = segment.elementAt(track)
            if (!element) {
                continue
            }
            if ((element.type == Element.CHORD || element.type == Element.REST) && element.tuplet) {
                hasTuplets = true
                return
            }
        }
    })

    return hasTuplets
}

function collectVoiceChordRecords(measure, staffIdx, measureStart, measureEnd) {
    var records = []
    var trackBase = staffIdx * 4

    forEachMeasureSegment(measure, function (segment) {
        for (var voiceIdx = 0; voiceIdx <= 3; voiceIdx++) {
            var track = trackBase + voiceIdx
            var element = segment.elementAt(track)
            if (!element || element.type != Element.CHORD) {
                continue
            }

            var durationTicks = getDurationTicks(element)
            if (durationTicks <= 0) {
                continue
            }

            var recordStart = segment.tick
            var recordEnd = recordStart + durationTicks

            if (recordEnd <= measureStart || recordStart >= measureEnd) {
                continue
            }
            if (recordStart < measureStart) {
                recordStart = measureStart
            }
            if (recordEnd > measureEnd) {
                recordEnd = measureEnd
            }

            var pitches = []
            var pitchMap = {}
            var tieStartByPitch = {}
            var tieStopByPitch = {}
            var tpcByPitch = {}

            for (var n in element.notes) {
                var note = element.notes[n]
                var pitch = note.pitch
                if (pitchMap[pitch]) {
                    continue
                }
                pitchMap[pitch] = true
                pitches.push(pitch)

                var tpc = noteTpc(note)
                if (tpc !== null && tpcByPitch[pitch] === undefined) {
                    tpcByPitch[pitch] = tpc
                }

                if (note.tieForward) {
                    tieStartByPitch[pitch] = true
                }
                if (note.tieBack) {
                    tieStopByPitch[pitch] = true
                }
            }

            if (!pitches.length) {
                continue
            }

            records.push({
                start: recordStart,
                end: recordEnd,
                pitches: pitches,
                pitchMap: pitchMap,
                tieStartByPitch: tieStartByPitch,
                tieStopByPitch: tieStopByPitch,
                tpcByPitch: tpcByPitch
            })
        }
    })

    return records
}

function noteTpc(note) {
    if (!note) {
        return null
    }
    if (note.tpc !== undefined) {
        return note.tpc
    }
    if (note.tpc1 !== undefined) {
        return note.tpc1
    }
    return null
}

function getDurationTicks(chordRest) {
    if (chordRest.duration && chordRest.duration.ticks !== undefined) {
        return chordRest.duration.ticks
    }
    if (chordRest.actualDuration && chordRest.actualDuration.ticks !== undefined) {
        return chordRest.actualDuration.ticks
    }
    return 0
}

function shouldTiePitchAtBoundary(records, pitch, boundaryTick) {
    var hasLeftTieStart = false
    var hasRightTieStop = false

    for (var i in records) {
        var rec = records[i]
        if (!rec.pitchMap[pitch]) {
            continue
        }

        if (rec.start < boundaryTick && rec.end > boundaryTick) {
            return true
        }

        if (rec.end == boundaryTick && rec.tieStartByPitch[pitch]) {
            hasLeftTieStart = true
        }
        if (rec.start == boundaryTick && rec.tieStopByPitch[pitch]) {
            hasRightTieStop = true
        }
    }

    return hasLeftTieStart && hasRightTieStop
}

function rewriteMeasureStaffVoices(measure, staffIdx, measureStart, measureEnd, events, incomingPitchMap, outgoingPitchMap, spellingRequests, tieRequests) {
    var trackBase = staffIdx * 4
    var toRemove = []

    forEachMeasureSegment(measure, function (segment) {
        for (var voiceIdx = 0; voiceIdx <= 3; voiceIdx++) {
            var element = segment.elementAt(trackBase + voiceIdx)
            if (element && (element.type == Element.CHORD || element.type == Element.REST)) {
                toRemove.push(element)
            }
        }
    })

    for (var r in toRemove) {
        removeElement(toRemove[r])
    }

    var cursor = curScore.newCursor()
    cursor.track = trackBase
    cursor.rewindToTick(measureStart)

    for (var i in events) {
        var event = events[i]
        var durationTicks = event.end - event.start
        if (durationTicks <= 0) {
            continue
        }

        var dur = fractionFromTicks(durationTicks)
        cursor.setDuration(dur.numerator, dur.denominator)

        if (event.pitches.length) {
            cursor.addNote(event.pitches[0], false)
            for (var p = 1; p < event.pitches.length; p++) {
                cursor.addNote(event.pitches[p], true)
            }

            for (var sp = 0; sp < event.pitches.length; sp++) {
                var spellPitch = event.pitches[sp]
                if (event.tpcByPitch && event.tpcByPitch[spellPitch] !== undefined) {
                    spellingRequests.push({
                        tick: event.start,
                        track: trackBase,
                        pitch: spellPitch,
                        tpc: event.tpcByPitch[spellPitch]
                    })
                }
            }

            for (var tp in event.ties) {
                if (event.ties[tp].start) {
                    tieRequests.push({
                        kind: "internal",
                        tick: event.start,
                        track: trackBase,
                        pitch: parseInt(tp, 10)
                    })
                }
            }

            if (event.start == measureStart) {
                for (var ip in incomingPitchMap) {
                    var inPitch = parseInt(ip, 10)
                    if (event.ties[inPitch]) {
                        tieRequests.push({
                            kind: "incoming",
                            tick: event.start,
                            track: trackBase,
                            pitch: inPitch
                        })
                    }
                }
            }

            if (event.end == measureEnd) {
                for (var op in outgoingPitchMap) {
                    var outPitch = parseInt(op, 10)
                    if (event.ties[outPitch]) {
                        tieRequests.push({
                            kind: "outgoing",
                            tick: event.start,
                            track: trackBase,
                            pitch: outPitch
                        })
                    }
                }
            }
        } else {
            cursor.addRest()
        }
    }
}

function applySpellingRequests(spellingRequests) {
    if (!spellingRequests || !spellingRequests.length) {
        return
    }

    spellingRequests.sort(function (a, b) {
        if (a.tick != b.tick) {
            return a.tick - b.tick
        }
        if (a.track != b.track) {
            return a.track - b.track
        }
        return a.pitch - b.pitch
    })

    var seen = {}
    for (var i in spellingRequests) {
        var req = spellingRequests[i]
        var key = req.tick + ":" + req.track + ":" + req.pitch
        if (seen[key]) {
            continue
        }
        seen[key] = true

        var chord = findChordAtTickWithPitch(req.track, req.tick, req.pitch)
        var note = noteByPitch(chord, req.pitch)
        setNoteTpc(note, req.tpc)
    }
}

function applyTieRequests(tieRequests) {
    if (!tieRequests.length) {
        return
    }

    tieRequests.sort(function (a, b) {
        if (a.tick != b.tick) {
            return a.tick - b.tick
        }
        if (a.track != b.track) {
            return a.track - b.track
        }
        return a.pitch - b.pitch
    })

    for (var i in tieRequests) {
        var req = tieRequests[i]
        var sourceChord = null

        if (req.kind == "incoming") {
            sourceChord = findPreviousChordWithPitch(req.track, req.tick, req.pitch)
        } else {
            sourceChord = findChordAtTickWithPitch(req.track, req.tick, req.pitch)
        }

        triggerTieFromChord(sourceChord, req.pitch)
    }

    curScore.selection.clear()
}

function findChordAtTickWithPitch(track, tick, pitch) {
    var cursor = curScore.newCursor()
    cursor.track = track
    cursor.rewindToTick(tick)
    var chord = cursor.element
    if (chord && chord.type == Element.CHORD && chordHasPitch(chord, pitch)) {
        return chord
    }
    return null
}


function findPreviousChordWithPitch(track, tick, pitch) {
    var sameTrack = findPreviousChordWithPitchOnTrack(track, tick, pitch)
    if (sameTrack) {
        return sameTrack
    }
    return findPreviousChordWithPitchGlobal(tick, pitch)
}

function findPreviousChordWithPitchOnTrack(track, tick, pitch) {
    var cursor = curScore.newCursor()
    cursor.track = track
    cursor.rewindToTick(tick)

    var hops = 256
    while (hops > 0 && cursor.prev()) {
        hops--
        var chord = cursor.element
        if (chord && chord.type == Element.CHORD && chordHasPitch(chord, pitch)) {
            return chord
        }
    }
    return null
}
function findPreviousChordWithPitchGlobal(tick, pitch) {
    var bestCandidate = null

    for (var track = 0; track < curScore.ntracks; track++) {
        var cursor = curScore.newCursor()
        cursor.track = track
        cursor.rewindToTick(tick)

        var hops = 256
        while (hops > 0 && cursor.prev()) {
            hops--
            var chord = cursor.element
            if (chord && chord.type == Element.CHORD && chordHasPitch(chord, pitch)) {
                var pitchNote = noteByPitch(chord, pitch)
                var candidate = {
                    chord: chord,
                    tick: cursor.tick,
                    tieForward: pitchNote && pitchNote.tieForward ? true : false
                }
                if (!bestCandidate || isBetterTieSourceCandidate(candidate, bestCandidate)) {
                    bestCandidate = candidate
                }
                break
            }
        }
    }

    return bestCandidate ? bestCandidate.chord : null
}

function isBetterTieSourceCandidate(candidate, best) {
    if (candidate.tieForward != best.tieForward) {
        return candidate.tieForward
    }
    return candidate.tick > best.tick
}

function chordHasPitch(chord, pitch) {
    return noteByPitch(chord, pitch) != null
}

function noteByPitch(chord, pitch) {
    if (!chord || chord.type != Element.CHORD) {
        return null
    }
    for (var n in chord.notes) {
        var note = chord.notes[n]
        if (note.pitch == pitch) {
            return note
        }
    }
    return null
}

function setNoteTpc(note, tpc) {
    if (!note || tpc === undefined || tpc === null) {
        return
    }

    try {
        if (note.tpc !== undefined) {
            note.tpc = tpc
        }
    } catch (e1) {}

    try {
        if (note.tpc1 !== undefined) {
            note.tpc1 = tpc
        }
        if (note.tpc2 !== undefined) {
            note.tpc2 = tpc
        }
    } catch (e2) {}
}

function triggerTieFromChord(chord, pitch) {
    var note = noteByPitch(chord, pitch)
    if (!note || note.tieForward) {
        return false
    }
    curScore.selection.clear()
    curScore.selection.select(note, false)
    cmd("tie")
    return true
}

function cleanupEmptySecondaryVoiceRests(measureTicksFilter) {
    var removed = 0

    for (var measure = curScore.firstMeasure; measure; measure = measure.nextMeasure) {
        if (!measure.firstSegment) {
            continue
        }

        if (measureTicksFilter && !measureTicksFilter[measure.firstSegment.tick]) {
            continue
        }

        for (var staffIdx = 0; staffIdx < curScore.nstaves; staffIdx++) {
            var trackBase = staffIdx * 4
            for (var voiceIdx = 1; voiceIdx <= 3; voiceIdx++) {
                var track = trackBase + voiceIdx
                var hasPitchChord = false
                var restsToRemove = []

                forEachMeasureSegment(measure, function (segment) {
                    var element = segment.elementAt(track)
                    if (!element) {
                        return
                    }
                    if (element.type == Element.CHORD) {
                        hasPitchChord = true
                    } else if (element.type == Element.REST) {
                        restsToRemove.push(element)
                    }
                })

                if (!hasPitchChord) {
                    for (var r in restsToRemove) {
                        removeElement(restsToRemove[r])
                        removed++
                    }
                }
            }
        }
    }

    if (removed) {
        console.log("Removed " + removed + " rest(s) from empty secondary voices.")
    }
}









