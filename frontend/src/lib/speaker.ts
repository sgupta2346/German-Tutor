export type SpeakerGender = "female" | "male";

const FEMALE_NAMES = new Set(
  "anna lisa julia eva maria sarah laura lena sophie sofia emma mia hannah lea lina clara katharina sabine petra monika claudia nina jana sandra marie leonie johanna anja birgit karin ursula ingrid helga greta frieda ida paula charlotte amelie emilia luisa franziska stefanie christina andrea susanne nicole melanie katrin carla elena".split(" "),
);
const MALE_NAMES = new Set(
  "max tom jonas peter paul lukas leon felix ben thomas michael stefan andreas markus daniel jan tim david florian sebastian tobias alexander matthias christian martin frank klaus hans jürgen uwe wolfgang karl otto fritz emil noah elias finn moritz niklas philipp simon johannes georg".split(" "),
);
const MALE_ROLES = new Set(
  "student lehrer arzt ingenieur koch verkäufer kellner schüler manager programmierer journalist künstler fahrer bäcker anwalt polizist mechaniker architekt musiker sänger schauspieler rentner vater mann bruder sohn freund opa onkel großvater ehemann kollege chef".split(" "),
);
const FEMALE_ROLE_WORDS = new Set("mutter frau schwester tochter freundin oma tante großmutter ehefrau kollegin chefin".split(" "));

const INTRO = /\b(?:ich\s+bin|ich\s+heiße|ich\s+heisse|mein\s+name\s+ist|ich\s+arbeite\s+als)\s+(?:(?:die|der|eine|ein|frau|herr)\s+)?([a-zäöüß-]+)/gi;
const TITLE = /\b(?:ich\s+bin|mein\s+name\s+ist)\s+(frau|herr)\b/i;

export function speakerGender(text: string): SpeakerGender | null {
  const title = text.match(TITLE);
  if (title) return title[1].toLowerCase() === "frau" ? "female" : "male";
  for (const m of text.matchAll(INTRO)) {
    const word = m[1].toLowerCase();
    if (FEMALE_NAMES.has(word) || FEMALE_ROLE_WORDS.has(word)) return "female";
    if (MALE_NAMES.has(word) || MALE_ROLES.has(word)) return "male";
    if (/(?:in|innen)$/.test(word) && MALE_ROLES.has(word.replace(/in$/, "").replace(/innen$/, ""))) return "female";
    if (/^[a-zäöüß]+erin$|^[a-zäöüß]+entin$|ärztin$|köchin$|anwältin$/.test(word)) return "female";
  }
  return null;
}

const FEMALE_BROWSER = ["Katja", "Seraphina", "Amala", "Hedda", "Ingrid", "Louisa", "Maja", "Tanja", "Elke", "Gisela", "Klarissa", "Anna", "Petra", "Google Deutsch"];
const MALE_BROWSER = ["Conrad", "Florian", "Killian", "Stefan", "Bernd", "Christoph", "Kasper", "Klaus", "Ralf", "Markus", "Yannick"];

export function browserVoiceGender(name: string): SpeakerGender | null {
  if (FEMALE_BROWSER.some((n) => name.includes(n))) return "female";
  if (MALE_BROWSER.some((n) => name.includes(n))) return "male";
  return null;
}
