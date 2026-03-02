//==============================================
//  Score Simplifier
//  Reworked from Cautionary Accidentals template
//==============================================

import QtQuick 2.0
import MuseScore 3.0
import "assets/accidentals.js" as Accidentals

MuseScore {
    title: qsTr("Simplify Voices Only")
    description: qsTr("Move all selected voices to the primary voice in each staff.")
    version: "4.0"
    categoryCode: "composing-arranging-tools"
    thumbnailName: "assets/logo.png"
    requiresScore: true

    onRun: Accidentals.runPlugin("voices")
}
