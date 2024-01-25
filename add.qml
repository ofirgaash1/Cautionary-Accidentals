//==============================================
//  Cautionary Accidentals v4.0
//  https://github.com/XiaoMigros/Cautionary-Accidentals
//  Copyright (C)2023 XiaoMigros
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.
//==============================================

import QtQuick 2.0
import MuseScore 3.0
import Qt.labs.settings 1.0
import "assets/defaultsettings.js" as DSettings

MuseScore {
    title: qsTr("Add Cautionary Accidentals")
    version: "4.0"
    description: qsTr("This plugin adds cautionary accidentals to the score")
    categoryCode: "composing-arranging-tools"
    thumbnailName: "assets/logo.png"
    requiresScore: true

    //  TODO:
    //  Add option to restate accidentals coming from chromatic runs

    //===============================================================================
    //  Settings
    //===============================================================================

    // Cancel single accidentals when preceded by double
    property var setting0: {
        "addNaturals": false
    }

    // Notes in same measure at different octave
    property var setting1: {
        "addAccidentals": true,    //  If to cancel, bracket type
        "bracketType": 0,          //  0 = no brackets, 1 = round, 2 = square
        "parseGraceNotes": true,   //  Include grace notes in calculations and adding
        "durationMode": 0          //  How to parse durations (0": not before, 1": instantaneous, 2": during)
    }

    // Notes in same measure in different staves (of same instrument)
    property var setting2: {
        "addAccidentals": true,
        "bracketType": 0,
        "parseGraceNotes": true,
        "durationMode": 0
    }

    // Notes in same measure, different octave, different staves
    property var setting3: {
        "addAccidentals": true,
        "bracketType": 0,
        "parseGraceNotes": false,
        "durationMode": 0
    }

    // Notes in different measures 
    property var setting4: {
        //  same octave
        "a": {
            "addAccidentals": true,
            "bracketType": 0,
            "parseGraceNotes": true
        },
        //  different octaves
        "b": {
            "addAccidentals": true,
            "bracketType": 0,
            "parseGraceNotes": false
        }
    }

    // Notes in different measures & different staves
    property var setting5: {
        "a": {
            "addAccidentals": true,
            "bracketType": 0,
            "parseGraceNotes": false
        },
        "b": {
            "addAccidentals": false,
            "bracketType": 0,
            "parseGraceNotes": false
        }
    }

    // (same) Notes after grace notes that add accidental
    property var setting6: {
        "a": {
            "addAccidentals": true,
            "bracketType": 0
        },
        // add to notes in different staves
        "b": {
            "addAccidentals": true,
            "bracketType": 0
        }
    }

    // Notes over a key change (new bar)
    property var setting7: {
        "addAccidentals": true,    //  If to run
        "bracketType": 0,          //  Bracket type
        "cancelOctaves": false,    //  Cancel in different octaves
        "parseGraceNotes": true,   //  Include grace notes in calculation and adding
        "cancelMode": true         //  Excessive cancelling mode (see setting9)
    }

    // Notes over a key change (mid bar)
    property var setting8: {
        "addAccidentals": true, 
        "bracketType": 0,
        "cancelOctaves": false,
        "parseGraceNotes": true,
        "cancelMode": true
    }

    // How to handle excessive cancelling
    property var setting9: {
        "a": true,  // In same measure
        "b": true   // In different measures
    }
    //option true: add accidentals as needed until cancelled in original octave
    //   notes of same tick get cancelled
    //   cancelling has to happen in original staff
    //option false: continue to add accidentals as needed if not previously cancelled in same octave

    function loadSettings(settingObj) {
        setting0 = settingObj.setting0
        setting1 = settingObj.setting1
        setting2 = settingObj.setting2
        setting3 = settingObj.setting3
        setting4 = settingObj.setting4
        setting5 = settingObj.setting5
        setting6 = settingObj.setting6
        setting7 = settingObj.setting7
        setting8 = settingObj.setting8
        setting9 = settingObj.setting9
    }

    function tpcToName(tpc) {
        var tpcNames = [ //-1 thru 33
            "Fbb", "Cbb", "Gbb", "Dbb", "Abb", "Ebb", "Bbb",
            "Fb",  "Cb",  "Gb",  "Db",  "Ab",  "Eb",  "Bb",
            "F",   "C",   "G",   "D",   "A",   "E",   "B",
            "F#",  "C#",  "G#",  "D#",  "A#",  "E#",  "B#",
            "F##", "C##", "G##", "D##", "A##", "E##", "B##"
        ]
        return tpcNames[tpc+1]
    }

    function tpcToNote(tpc) {
        var noteNames = ["C", "G", "D", "A", "E", "B", "F"]
        return noteNames[(tpc+7) % 7]
    }

    onRun: {
        if (options.uSettings && JSON.parse(options.uSettings).edited) {
            loadSettings(JSON.parse(options.uSettings))
        } else {
            loadSettings(DSettings.read())
        }

        curScore.startCmd()
        var full = false
        if (!curScore.selection.elements.length) {
            console.log("No selection. Applying plugin to all notes...")
            cmd("select-all")
            full = true
        } else {
            console.log("Applying plugin to selection...")
        }
        var notes = []
        for (var i in curScore.selection.elements) {
            if (curScore.selection.elements[i].type == Element.NOTE && !curScore.selection.elements[i].staff.part.hasDrumStaff) {
                notes.push(curScore.selection.elements[i])
            }
        }

        notes.sort(function (a,b) {
            //sort notes by tick, prioritise notes with accidentals, prioritise non-doubles to avoid excessive brackets
            if (isSameTick(a,b)) {
                var testCount = 0
                if (a.accidental) {
                    testCount--
                }
                if (b.accidental) {
                    testCount++
                }
                if (testCount == 0) {
                    if (a.accidentalType == Accidental.SHARP2 || a.accidentalType == Accidental.FLAT2) {
                        testCount++
                    }
                    if (b.accidentalType == Accidental.SHARP2 || b.accidentalType == Accidental.FLAT2) {
                        testCount++//-- ??
                    }
                }
                return testCount
            } else {
                return (tickOfNote(a) - tickOfNote(b))
            }
        })

        for (var i = notes.length-1; i >= 0; i--) {
            if (notes[i].accidental && notes[i].accidental.visible) {
                var notes2 = notes.slice(0)
                addAccidentals(notes2.splice(i, notes2.length)) //notes.subarray non-functional
            } else {
                if (setting7.addAccidentals || setting8.addAccidentals) {
                    var notes2 = notes.slice(0)
                    keySigTest(notes2.splice(i, notes2.length))
                }
            }
        }

        if (full) {
            curScore.selection.clear()
        }
        curScore.endCmd()
        quit()
    }

    function addAccidentals(noteList) {
        var testNote = noteList.shift()
        var testName = tpcToNote(testNote.tpc)
        console.log("Note with accidental found (" + tpcToName(testNote.tpc) + ").\r\n"
            + "Attempting to add cautionary accidentals to " + noteList.length + " note(s).")
        var cancelledNotes = []
        for (var j in noteList) {
            var note = noteList[j]
            var changeNote = false
            var changeBracket = []
            if (!note.tieBack) {
                if (setting1.addAccidentals) {
                    if (isSameNoteName(note, testNote) && !isSamePitch(note, testNote) &&
                        isSameMeasure(note, testNote) && isSameStaff(note, testNote) && (setting1.parseGraceNotes || !isGraceNote(testNote))) {
                        if (durationModeIsValid(setting1.durationMode, note, testNote)) {
                            var check = true
                            for (var k in cancelledNotes) {
                                if (isSameNoteName(note, cancelledNotes[k]) && ((setting9.a && isSamePitch(testNote, cancelledNotes[k])) ? isOctavedPitch(note, cancelledNotes[k]) : isSamePitch(note, cancelledNotes[k])) &&
                                    isSameStaff(note, cancelledNotes[k]) && isSameMeasure(note, cancelledNotes[k])) {
                                    console.log("The accidental in question has been cancelled, no need to add further cautionary accidentals")
                                    check = false
                                    break
                                }
                            }
                            if (check) {
                                changeNote = true
                                changeBracket.push(setting1.bracketType)
                                if (isSameNoteName(note, testNote) && isSameStaff(note, testNote)) {
                                    //isSameStaff might not be needed here
                                    cancelledNotes.push(note)
                                }
                            }
                        }
                    }
                }

                if (setting2.addAccidentals) {
                    if (isSameNoteName(note, testNote) && !isSamePitch(note, testNote) && isSameOctave(note, testNote) && isSameMeasure(note, testNote) &&
                        !isSameStaff(note, testNote) && isSamePart(note, testNote) && (setting2.parseGraceNotes || !isGraceNote(testNote))) {
                        if (durationModeIsValid(setting2.durationMode, note, testNote)) {
                            var check = true
                            for (var k in cancelledNotes) {
                                if (isSameNoteName(note, cancelledNotes[k]) && ((setting9.a && isSamePitch(testNote, cancelledNotes[k])) ? isOctavedPitch(note, cancelledNotes[k]) : isSamePitch(note, cancelledNotes[k])) &&
                                    isSameStaff(note, cancelledNotes[k]) && isSameMeasure(note, cancelledNotes[k])) {
                                    console.log("The accidental in question has been cancelled, no need to add further cautionary accidentals")
                                    check = false
                                    break
                                }
                            }
                            if (check) {
                                changeNote = true
                                changeBracket.push(setting2.bracketType)
                                if (isSameNoteName(note, testNote) && isSamePart(note, testNote)) {
                                    //isSamePart might not be needed here
                                    cancelledNotes.push(note)
                                }
                            }
                        }
                    }
                }

                if (setting3.addAccidentals) {
                    if (isSameNoteName(note, testNote) && !isSamePitch(note, testNote) && !isSameOctave(note, testNote) && isSameMeasure(note, testNote) &&
                        !isSameStaff(note, testNote) && isSamePart(note, testNote) && (setting3.parseGraceNotes || !isGraceNote(testNote))) {
                        if (durationModeIsValid(setting3.durationMode, note, testNote)) {
                            var check = true
                            for (var k in cancelledNotes) {
                                if (isSameNoteName(note, cancelledNotes[k]) && ((setting9.a && isSamePitch(testNote, cancelledNotes[k])) ? isOctavedPitch(note, cancelledNotes[k]) : isSamePitch(note, cancelledNotes[k])) &&
                                    isSameStaff(note, cancelledNotes[k]) && isSameMeasure(note, cancelledNotes[k])) {
                                    console.log("The accidental in question has been cancelled, no need to add further cautionary accidentals")
                                    check = false
                                    break
                                }
                            }
                            if (check) {
                                changeNote = true
                                changeBracket.push(setting3.bracketType)
                                if (isSameNoteName(note, testNote) && isSamePart(note, testNote)) {
                                    //isSamePart might not be needed here
                                    cancelledNotes.push(note)
                                }
                            }
                        }
                    }
                }

                if (setting4.a.addAccidentals) {
                    if (isSameNoteName(note, testNote) && !isSamePitch(note, testNote) &&
                        (isNextMeasure(note, testNote) || isNextMeasure(note, testNote.lastTiedNote)) && isSameStaff(note, testNote)) {
                        var check = true
                        for (var k in cancelledNotes) {
                            if (isSameNoteName(note, cancelledNotes[k]) && ((setting9.b && isSamePitch(testNote, cancelledNotes[k])) ? isOctavedPitch(note, cancelledNotes[k]) : isSamePitch(note, cancelledNotes[k])) &&
                                isSameStaff(note, cancelledNotes[k]) && isSameMeasure(note, cancelledNotes[k])) {
                                console.log("The accidental in question has been cancelled, no need to add further cautionary accidentals")
                                check = false
                                break
                            }
                        }
                        if (check) {
                            if (isSameOctave(note, testNote) && (setting4.parseGraceNotes || !isGraceNote(testNote))) {
                                changeNote = true
                                changeBracket.push(setting4.bracketType)
                            } else if (setting4.addAccidentals && (setting4.b.parseGraceNotes || !isGraceNote(testNote))) {
                                changeNote = true
                                changeBracket.push(setting4.bracketType)
                            }
                            if (isSameNoteName(note, testNote) && isSameStaff(note, testNote)) {
                                //isSameStaff might not be needed here
                                cancelledNotes.push(note)
                            }
                        }
                    }
                }

                if (setting5.a.addAccidentals) {
                    if (isSameNoteName(note, testNote) && !isSamePitch(note, testNote) &&
                        (isNextMeasure(note, testNote) || isNextMeasure(note, testNote.lastTiedNote)) && !isSameStaff(note, testNote) && isSamePart(note, testNote)) {
                        var check = true
                        for (var k in cancelledNotes) {
                            if (isSameNoteName(note, cancelledNotes[k]) && ((setting9.b && isSamePitch(testNote, cancelledNotes[k])) ? isOctavedPitch(note, cancelledNotes[k]) : isSamePitch(note, cancelledNotes[k])) &&
                                isSameStaff(note, cancelledNotes[k]) && isSameMeasure(note, cancelledNotes[k])) {
                                console.log("The accidental in question has been cancelled, no need to add further cautionary accidentals")
                                check = false
                                break
                            }
                        }
                        if (check) {
                            if (isSameOctave(note, testNote) && (setting5.a.parseGraceNotes || !isGraceNote(testNote))) {
                                changeNote = true
                                changeBracket.push(setting5.bracketType)
                            } else if (setting5.b.addAccidentals && (setting5.b.parseGraceNotes || !isGraceNote(testNote))) {
                                changeNote = true
                                changeBracket.push(setting5.b.bracketType)
                            }
                            if (isSameNoteName(note, testNote) && isSamePart(note, testNote)) {
                                //isSamePart might not be needed here
                                cancelledNotes.push(note)
                            }
                        }
                    }
                }

                if (setting6.a.addAccidentals) {
                    if (isSameNoteName(note, testNote) && isSamePitch(note, testNote) && isGraceNote(testNote) && !isGraceNote(note) &&
                        isSameMeasure(note, testNote) && (setting6.b.addAccidentals ? isSamePart(note, testNote) : isSameStaff(note, testNote))) {
                        var check = true
                        for (var k in cancelledNotes) {
                            if (isSameNoteName(note, cancelledNotes[k]) && isSamePitch(note, cancelledNotes[k]) && isSameStaff(note, cancelledNotes[k])) {
                                //optional: change isSameStaff to (setting6.b.addAccidentals ? isSamePart(note, testNote) : isSameStaff(note, testNote))
                                console.log("The accidental in question has been cancelled, no need to add further cautionary accidentals")
                                check = false
                                break
                            }
                        }
                        if (check) {
                            changeNote = true
                            cancelledNotes.push(note)
                            if (isSameStaff(note, testNote)) {
                                changeBracket.push(setting6.a.bracketType)
                            } else {
                                changeBracket.push(setting6.b.bracketType)
                            }
                        }
                    }
                }

                if (changeNote) {
                    if (isSameTick(note, testNote) && (testNote.tpc > 26 || testNote.tpc < 6)) {
                        changeBracket.push(0) //dont add brackets to reduced accidentals on same beat //TODO: same measure?
                    }
                    changeBracket.sort()
                    restateAccidental(note, shouldCancelDouble(testNote), changeBracket[0])
                    if (isSameNoteName(note, testNote) && isSameOctave(note, testNote)) {
                        cancelledNotes.push(note)
                        //only stop adding cautionary accidentals if note is of the same octave
                    }
                }
            }
        }
    }

    function keySigTest(noteList) {
        var testNote = noteList.shift()
        var testName = tpcToNote(testNote.tpc)
        console.log("Testing for key signature changes")
        var cancelledNotes = []
        for (var j in noteList) {
            var note = noteList[j]
            var changeNote = false
            var changeBracket = []
            if (!note.tieBack) {
                if (setting7.addAccidentals) {
                    if (isSameNoteName(note, testNote) && (setting7.cancelOctaves ? !isOctavedPitch(note, testNote) : (isSameOctave(note, testNote) && !isSamePitch(note, testNote))) &&
                        note.accidentalType == Accidental.NONE && isNextMeasure(note, testNote) && isSameStaff(note, testNote) && (setting7.parseGraceNotes || !isGraceNote(testNote))) {
                        var check = true
                        for (var k in cancelledNotes) {
                            if (isSameNoteName(note, cancelledNotes[k]) && (setting7.cancelMode ? isOctavedPitch(note, cancelledNotes[k]) : isSamePitch(note, cancelledNotes[k])) &&
                                isSameStaff(note, cancelledNotes[k])) {
                                console.log("The accidental in question has been cancelled, no need to add further cautionary accidentals")
                                check = false
                                break
                            }
                        }
                        if (check) {
                            changeNote = true
                            changeBracket.push(setting7.bracketType)
                            if (isSameNoteName(note, testNote) && isSameStaff(note, testNote) && (!setting7.cancelMode || isSameOctave(note, testNote))) {
                                cancelledNotes.push(note)
                            }
                        }
                    }
                }

                if (setting8.addAccidentals) {
                    if (isSameNoteName(note, testNote) && (setting8.cancelOctaves ? !isOctavedPitch(note, testNote) : (isSameOctave(note, testNote) && !isSamePitch(note, testNote))) &&
                        note.accidentalType == Accidental.NONE && isSameMeasure(note, testNote) && isSameStaff(note, testNote) && (setting8.parseGraceNotes || !isGraceNote(testNote))) {
                        var check = true
                        for (var k in cancelledNotes) {
                            if (isSameNoteName(note, cancelledNotes[k]) && (setting8.cancelMode ? isOctavedPitch(note, cancelledNotes[k]) : isSamePitch(note, cancelledNotes[k])) &&
                                isSameStaff(note, cancelledNotes[k])) {
                                console.log("The accidental in question has been cancelled, no need to add further cautionary accidentals")
                                check = false
                                break
                            }
                        }
                        if (check) {
                            changeNote = true
                            changeBracket.push(setting8.bracketType)
                            if (isSameNoteName(note, testNote) && isSameStaff(note, testNote) && (!setting8.cancelMode || isSameOctave(note, testNote))) {
                                cancelledNotes.push(note)
                            }
                        }
                    }
                }

                if (changeNote) {
                    if (isSameTick(note, testNote) && (testNote.tpc > 26 || testNote.tpc < 6)) {
                        changeBracket.push(0)
                    }
                    changeBracket.sort()
                    restateAccidental(note, shouldCancelDouble(testNote), changeBracket[0])
                }
            }
        }
    }

    function tickOfNote(note) {
        return isGraceNote(note) ? note.parent.parent.parent.tick : note.parent.parent.tick
    }
    function isGraceNote(note) {
        return note.noteType != 0
    }

    function isSameNoteName(note1, note2) {
        return tpcToNote(note1.tpc) == tpcToNote(note2.tpc)
    }

    function isSamePitch(note1, note2) {
        return note1.pitch == note2.pitch
    }

    function isSameOctave(note1, note2) {
        //return 12 * Math.round(note1.pitch/12) == 12 * Math.round(note2.pitch/12)
        return Math.abs(note1.pitch - note2.pitch) < 5
        //only to be used in conjunction with isSameNoteName
    }

    function isOctavedPitch(note1, note2) {
        return note1.pitch % 12 == note2.pitch % 12
    }

    function isSameTick(note1, note2) {
        return tickOfNote(note1) == tickOfNote(note2)
    }

    function isSameBeat(note1, note2) {
        return tickOfNote(note1) < (tickOfNote(note2) + durationOfNote(note2))
    }

    function durationOfNote(note) {
        return isGraceNote(note) ? 0 : note.parent.duration.ticks
    }

    function isSameMeasure(note1, note2) {
        return measureOf(note1).is(measureOf(note2))
    }

    function isNextMeasure(note1, note2) {  // order is relevant here
        return measureOf(note1).is(curScore.firstMeasure) ? false : measureOf(note1).prevMeasure.is(measureOf(note2))
    }

    function measureOf(note) {
        return isGraceNote(note) ? note.parent.parent.parent.parent : note.parent.parent.parent
    }

    function isSameStaff(note1, note2) {
        return note1.staff.is(note2.staff)
    }

    function isSamePart(note1, note2) {
        return note1.staff.part.is(note2.staff.part)
    }

    function durationModeIsValid(durationMode, note, testNote) {  // order is relevant here
        return durationMode == 0 || (durationMode == 1 && isSameTick(note, testNote)) || (durationMode == 2 && isSameBeat(note, testNote))
    }

    function shouldCancelDouble(note) {
	    return setting0.addNaturals ? (note.tpc > 26 || note.tpc < 6) : false
	}

    function restateAccidental(note, cancelDouble, bracketType) {
        var oldAccidental = note.accidentalType
        var accidental = Accidental.NONE
        switch (true) {
            case (note.tpc > 26): {
                accidental = Accidental.SHARP2
                break
            }
            case (note.tpc > 19): {
                if (cancelDouble) {
                    accidental = Accidental.NATURAL_SHARP
                } else {
                    accidental = Accidental.SHARP
                }
                break
            }
            case (note.tpc > 12): {
                accidental = Accidental.NATURAL
                break
            }
            case (note.tpc > 5): {
                if (cancelDouble) {
                    accidental = Accidental.NATURAL_FLAT
                } else {
                    accidental = Accidental.FLAT
                }
                break
            }
            default: {
                accidental = Accidental.FLAT2
            }
        }
        if (accidental != oldAccidental) {
            note.accidentalType = accidental
            note.accidental.visible = note.visible
            note.accidental.accidentalBracket = bracketType
            console.log("Added a cautionary accidental to note " + tpcToName(note.tpc))
            //0 = none, 1 = parentheses, 2 = brackets
        }
    }

    Settings {
        id: options
        category: "Cautionary Accidentals Plugin"
        property var uSettings
    }
}
