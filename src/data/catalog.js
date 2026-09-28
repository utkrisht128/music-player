/**
 * Local catalogue: the audio files bundled with this project under src/music.
 *
 * These are local files that already ship with the project. Nothing here is
 * fetched, scraped or proxied from a streaming provider. Every entity has a
 * STABLE string id — the previous implementation identified tracks by array
 * index, so inserting a track silently reassigned artwork and theming.
 *
 * Durations are deliberately absent: they are read from each file's own
 * metadata at runtime (see utils/durationCache.js) rather than hardcoded, so
 * no number shown to the user is invented.
 */

// --- artwork ---
import artHiddenGems from "../images/hiddengems.jpg";
import artMoosetape from "../images/295.jpg";
import artNotByChance from "../images/notbychance.jpg";
import artExcuses from "../images/Excuses.jpg";
import artNcr from "../images/ncr.jpg";
import artWeRollin from "../images/werollin.jpg";
import artGunday from "../images/gunday.jpg";
import artBheegi from "../images/BheegiBheegiGangster.jpg";
import artAadat from "../images/aadat.jpg";
import artAnamika from "../images/meribheegibheegisianamika.jpg";

// --- audio ---
import auDesires from "../music/Desires.mp3";
import auTereTe from "../music/TereTe.mp3";
import auMajheAale from "../music/MajheAale.mp3";
import auSpaceship from "../music/Spaceship.mp3";
import auWar from "../music/War.mp3";
import auAgainstAllOdds from "../music/AgainstAllOdds.mp3";
import au295 from "../music/295.mp3";
import auFate from "../music/Fate.mp3";
import auDrip from "../music/Drip.mp3";
import auTakeover from "../music/Takeover.mp3";
import auChances from "../music/Chances.mp3";
import auSaadaPyar from "../music/SaadaPyar.mp3";
import auForeigns from "../music/Foreigns.mp3";
import auGoat from "../music/Goat.mp3";
import auExcuses from "../music/Excuses.mp3";
import auNcr from "../music/NCR.mp3";
import auWeRollin from "../music/WeRollin.mp3";
import auGunday from "../music/Gunday .mp3";
import auBheegi from "../music/BheegiBheegiGangster.mp3";
import auAadat from "../music/Aadat.mp3";
import auAnamika from "../music/MeriBheegiBheegiSiAnamika.mp3";

export const ALBUMS = [
  { id: "al_hidden_gems",   title: "Hidden Gems",              artwork: artHiddenGems,  year: 2021, type: "Album" },
  { id: "al_moosetape",     title: "Moosetape",                artwork: artMoosetape,   year: 2021, type: "Album" },
  { id: "al_not_by_chance", title: "Not By Chance",            artwork: artNotByChance, year: 2020, type: "Album" },
  { id: "al_excuses",       title: "Excuses",                  artwork: artExcuses,     year: 2020, type: "Single" },
  { id: "al_ncr",           title: "NCR",                      artwork: artNcr,         year: 2021, type: "Single" },
  { id: "al_we_rollin",     title: "We Rollin",                artwork: artWeRollin,    year: 2021, type: "Single" },
  { id: "al_gunday",        title: "Gunday",                   artwork: artGunday,      year: 2022, type: "Single" },
  { id: "al_bheegi",        title: "Bheegi Bheegi (Gangster)", artwork: artBheegi,      year: 2006, type: "Single" },
  { id: "al_aadat",         title: "Aadat",                    artwork: artAadat,       year: 2004, type: "Single" },
  { id: "al_anamika",       title: "Meri Bheegi Bheegi Si",    artwork: artAnamika,     year: 1973, type: "Single" },
];

/**
 * `artists` is an ordered list of display names; the first is the primary
 * artist. Artist entities are derived from these lists by the local provider,
 * so a featured credit is never lost the way it was in the old flat string.
 */
export const TRACKS = [
  { id: "tr_desires",   title: "Desire",                artists: ["AP Dhillon", "Gurinder Gill"],                                 albumId: "al_hidden_gems",   trackNo: 1, src: auDesires },
  { id: "tr_tere_te",   title: "Tere Te",               artists: ["AP Dhillon", "Gurinder Gill"],                                 albumId: "al_hidden_gems",   trackNo: 2, src: auTereTe },
  { id: "tr_majhe",     title: "Majhe Aale",            artists: ["AP Dhillon", "Shinda Kahlon", "Gurinder Gill", "Gminxr"],      albumId: "al_hidden_gems",   trackNo: 3, src: auMajheAale },
  { id: "tr_spaceship", title: "Spaceship",             artists: ["AP Dhillon", "Shinda Kahlon", "Gminxr"],                       albumId: "al_hidden_gems",   trackNo: 4, src: auSpaceship },
  { id: "tr_war",       title: "War",                   artists: ["AP Dhillon", "Gurinder Gill"],                                 albumId: "al_hidden_gems",   trackNo: 5, src: auWar },
  { id: "tr_odds",      title: "Against All Odds",      artists: ["AP Dhillon", "Gurinder Gill", "Shinda Kahlon", "Gminxr"],      albumId: "al_hidden_gems",   trackNo: 6, src: auAgainstAllOdds },

  { id: "tr_295",       title: "295",                   artists: ["Sidhu Moose Wala"],                                            albumId: "al_moosetape",     trackNo: 1, src: au295 },

  { id: "tr_fate",      title: "Fate",                  artists: ["AP Dhillon", "Gurinder Gill", "Money Musik", "Shinda Kahlon"], albumId: "al_not_by_chance", trackNo: 1, src: auFate },
  { id: "tr_drip",      title: "Drip",                  artists: ["AP Dhillon", "Gurinder Gill", "Money Musik", "Duvy"],          albumId: "al_not_by_chance", trackNo: 2, src: auDrip },
  { id: "tr_takeover",  title: "Takeover",              artists: ["AP Dhillon", "Gurinder Gill", "Money Musik", "AR Paisley"],    albumId: "al_not_by_chance", trackNo: 3, src: auTakeover },
  { id: "tr_chances",   title: "Chances",               artists: ["AP Dhillon", "Gurinder Gill", "Money Musik"],                  albumId: "al_not_by_chance", trackNo: 4, src: auChances },
  { id: "tr_sadda",     title: "Sadda Pyaar",           artists: ["AP Dhillon", "Gurinder Gill", "Money Musik"],                  albumId: "al_not_by_chance", trackNo: 5, src: auSaadaPyar },
  { id: "tr_foreigns",  title: "Foreigns",              artists: ["AP Dhillon", "Gurinder Gill", "Money Musik"],                  albumId: "al_not_by_chance", trackNo: 6, src: auForeigns },
  { id: "tr_goat",      title: "Goat",                  artists: ["AP Dhillon", "Gurinder Gill", "Money Musik"],                  albumId: "al_not_by_chance", trackNo: 7, src: auGoat },

  { id: "tr_excuses",   title: "Excuses",               artists: ["AP Dhillon", "Gurinder Gill", "Intense"],                      albumId: "al_excuses",       trackNo: 1, src: auExcuses },
  { id: "tr_ncr",       title: "NCR Title Song",        artists: ["TimeLiners"],                                                  albumId: "al_ncr",           trackNo: 1, src: auNcr },
  { id: "tr_we_rollin", title: "We Rollin",             artists: ["Shubh"],                                                       albumId: "al_we_rollin",     trackNo: 1, src: auWeRollin },
  { id: "tr_gunday",    title: "Gunday",                artists: ["Pranjal Dahiya", "Devender Ahlawat", "Nitin Gill"],            albumId: "al_gunday",        trackNo: 1, src: auGunday },
  { id: "tr_bheegi",    title: "Bheegi Bheegi",         artists: ["Pritam", "James"],                                             albumId: "al_bheegi",        trackNo: 1, src: auBheegi },
  { id: "tr_aadat",     title: "Aadat",                 artists: ["Atif Aslam"],                                                  albumId: "al_aadat",         trackNo: 1, src: auAadat },
  { id: "tr_anamika",   title: "Meri Bheegi Bheegi Si", artists: ["R.D. Burman"],                                                 albumId: "al_anamika",       trackNo: 1, src: auAnamika },
];

/** Curated shelves for the home page. Track ids only — resolved by the provider. */
export const CURATED = [
  {
    id: "cur_punjabi_wave",
    title: "Punjabi Wave",
    description: "The AP Dhillon and Gurinder Gill run, back to back.",
    artwork: artHiddenGems,
    trackIds: ["tr_desires", "tr_tere_te", "tr_majhe", "tr_spaceship", "tr_excuses", "tr_war"],
  },
  {
    id: "cur_late_night",
    title: "Late Night Drive",
    description: "Low lights, long roads.",
    artwork: artNotByChance,
    trackIds: ["tr_fate", "tr_drip", "tr_takeover", "tr_chances", "tr_we_rollin", "tr_295"],
  },
  {
    id: "cur_classics",
    title: "Timeless",
    description: "Songs that outlived their decade.",
    artwork: artAnamika,
    trackIds: ["tr_anamika", "tr_bheegi", "tr_aadat"],
  },
  {
    id: "cur_hype",
    title: "Full Volume",
    description: "For when the speakers deserve it.",
    artwork: artGunday,
    trackIds: ["tr_gunday", "tr_goat", "tr_foreigns", "tr_odds", "tr_ncr", "tr_we_rollin"],
  },
];
