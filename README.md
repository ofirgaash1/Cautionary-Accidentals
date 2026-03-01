General info on plugins for 4.x:

Updated 11 months ago
This chapter is for MuseScore 4 plugin developers. To fork the main program, visit the main sections in Developers' handbook.
For info on what plugins are, how to install and use them, visit Musescore 4 handbook plugin chapter.

Porting 3.x plugins to Musescore 4
Plugin system change coming up in 4.x, see github issue and graffesmusic's comment .

Some plugins have been ported to or created for Mu4:

This list (Plugins in the repository marked as being available for 4.x)
Batch Convert (not really working though, except for the UI)
Some plugins have been ported to or created for Mu4.4 (Qt6):

PruneStack by rob@birdwellmusic.com https://musescore.org/en/node/367573
Tips for adapting plugins for 4.x
Volatile: prone to become outdated as the plugin API changes
Last updated: 31st Aug 2024

Have your plugin and all its dependencies (if any) in its own subfolder (example)

In the plugin file itself, add the new MuseScore 4 Properties conditionally, for MuseScore 4.0-4.3 and these comments, for MuseScore 4.4, like this, to have the plugin work for MuseScore 3.x, 4.0-4.3 and 4.4:

    //4.4 title: "Some Title"
    //4.4 thumbnailName: "some_thumbnail.png"
    //4.4 categoryCode: "some_category"
    Component.onCompleted: {
        if (mscoreMajorVersion >= 4 && mscoreMinorVersion <= 3) {
            title: "Some Title";
            thumbnailName = "some_thumbnail.png";
            categoryCode = "some_category";
        }
    }
 
If you need it for MuseScore 4 only, use:

    title: "Some Title"
    thumbnailName: "some_thumbnail.png"
    categoryCode: "some_category"
 
title is displayed in the Plugin Manager window (Home/Plugins), and makes the plugin easy to find.
thumbnailName is the file path to any Plugin logo, also displayed in the Plugin Manager.
If you add a thumbnail, place it in the plugin subfolder. If no file is provided, a default image will be used in its place.
categoryCode assigns the plugin to a specific sub-menu in the plugins tab (Currently available are: "composing-arranging-tools", "color-notes", "playback" and "lyrics").
Place your translations files (if any) in a "translations" folder placed the plugin subfolder.

Remove all occurences of Qt.quit(), else the plugin will crash MuseScore 4!

If you don't intend to use the plugin with Mu3, you can replace the Qt.quit() with quit().
The latter is not supported by Mu3, and will result in an (ignorable) error.
If you want to avoid that message and change the Mu3 version as little as possible, use this:
(typeof(quit) === 'undefined' ? Qt.quit : quit)()
Alternatively you could use return, which should work in all MuseScore versions.
The APIs readScore() and writeScore() are not functional in Mu4 (yet).

If your plugin modifies a score, those modifications need to be enclosed by

    curScore.startCmd();
    ...
    curScore.endCmd();
 
This should be done for Mu3 too, but there is optional, for Mu4 it is mandatory though.

pluginType: "dock" is not working. Changing it to pluginType: "dialog" might work. Even using the methods from step 2 should work, only for Mu4, while keeping "dock" for Mu3

The filePath property isn't working. You could use Qt.resolvedUrl(".").replace("file://", "") instead.

Many of the enums have elements relocated, most notably Sid (style settings, the new Mu4 settings aren't yet exposed), SymId (there are new symbols, and old ones have different locations) and chordRest.beamMode (values have new locations)
The first call to SymID can take upto 5 seconds!! (some compilation going on?)
see: https://musescore.org/en/node/364096?page=1#comment-1247486

TextField component from QtQuick.Controls 1.0, must be replaced with the TextEdit component from QtQuick.Controls 2.15 (or from QtQuick.Controls 2.2 if you require compatibility with MuseScore 3). See github issue #19326 for details, source https://musescore.org/en/node/357135

In MU4.4, Qt.labs.settings has been integrated in the Musescore module. The explicit import Qt.labs.settings 1.0 must be removed (it leads to an "Module "Qt.labs.settings" is not installed" error) and is not required for the Settings module to work.

Of the plugin uses RadioButtons, you'd need to replace the ExclusiveGroup type with ButtonGroup (That change may make ther plugin incompatible with MuseScopre versions prior to 4.4)

REMARKS:

These tips are meant to have the plugins working for both MuseScore 3.x and 4.x
Even if you follow those steps, the adapted plugins might not even showing up in Mu4's plugins list. If so check the logs for hints (on Windows: "%LOCALAPPDATA%\MuseScore\MuseScore4\logs\").
The UI are not always rendering nicely. A lot of text elements shorten to 'somethi...' unreasonably soon, and there is less control over UI styling. Additionally, plugins cannot retain navigation focus, meaning keyboard use is less snappy.
QProcess (proc. start ("cmd/c calc")) seems to be unable to run properly in musescore 4.3, windows, see davil123's post
playEvents length cap at 1000 reported by JMusicG , compared to 2000 in musescore 3
MuseScore Studio 4.4: Plugins must be updated to work with Qt 6 otherwise they won't appear in the Home screen or Plugins menu. See https://github.com/musescore/MuseScore/issues/21659 for details, and https://github.com/musescore/MuseScore/commits/7fe32bacbc9287b716d40462… for the required changes. source: https://musescore.org/en/node/365783
musescore.org/en/node/367488#comment-1254227
tips navigating github Mu4 repo
other related threads https://musescore.org/en/node/337463 and https://musescore.org/en/node/367488, the latter esp. about porting to MuseScore 4.4
