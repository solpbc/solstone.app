// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { FluentBundle, FluentResource } from "../vendor/fluent-bundle/index.js";
import { CATALOGS } from "./catalogs.mjs";

export function cardinal(val) { return { type: "cardinal", value: val }; }
export function integer(val) { return { type: "integer", value: val }; }

const LOCALES = {
  "en-US": { bundleLocale: "en-US", cardinal: "en" },
};

const CATEGORIES = {
  "en": (n) => (n == 1) ? "one" : "other",
};

const MESSAGES = {
  "site.brand.afewthingstoprotectthepeople": {
    resourceKey: "m736974652e6272616e642e616665777468696e6773746f70726f7465637474686570656f706c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.appicon": {
    resourceKey: "m736974652e6272616e642e61707069636f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.appiconcream": {
    resourceKey: "m736974652e6272616e642e61707069636f6e637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.appiconcreamsquircle": {
    resourceKey: "m736974652e6272616e642e61707069636f6e637265616d7371756972636c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.appiconqrtilegroundtheonly": {
    resourceKey: "m736974652e6272616e642e61707069636f6e717274696c6567726f756e647468656f6e6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.appicontransparent": {
    resourceKey: "m736974652e6272616e642e61707069636f6e7472616e73706172656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.b06a1a": {
    resourceKey: "m736974652e6272616e642e623036613161",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.boxed": {
    resourceKey: "m736974652e6272616e642e626f786564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.brandsolstone": {
    resourceKey: "m736974652e6272616e642e6272616e64736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.canonicalencodessolstoneappscanverified": {
    resourceKey: "m736974652e6272616e642e63616e6f6e6963616c656e636f646573736f6c73746f6e656170707363616e7665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.contentonlyonlightnormalsizetext": {
    resourceKey: "m736974652e6272616e642e636f6e74656e746f6e6c796f6e6c696768746e6f726d616c73697a6574657874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.copy": {
    resourceKey: "m736974652e6272616e642e636f7079",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.copyhexb06a1a": {
    resourceKey: "m736974652e6272616e642e636f7079686578623036613161",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.copyhexe8913a": {
    resourceKey: "m736974652e6272616e642e636f7079686578653839313361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.copyhexfcf3e4": {
    resourceKey: "m736974652e6272616e642e636f7079686578666366336534",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.copyhexfefcf8": {
    resourceKey: "m736974652e6272616e642e636f7079686578666566636638",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.copyhexffcc33": {
    resourceKey: "m736974652e6272616e642e636f7079686578666663633333",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.copysvg": {
    resourceKey: "m736974652e6272616e642e636f7079737667",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.daygroundthelogoasatimeof": {
    resourceKey: "m736974652e6272616e642e64617967726f756e647468656c6f676f61736174696d656f66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.dodont": {
    resourceKey: "m736974652e6272616e642e646f646f6e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.dontboxed": {
    resourceKey: "m736974652e6272616e642e646f6e74626f786564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.dontmodifythelogosnorecoloring": {
    resourceKey: "m736974652e6272616e642e646f6e746d6f646966797468656c6f676f736e6f7265636f6c6f72696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.dontrecolored": {
    resourceKey: "m736974652e6272616e642e646f6e747265636f6c6f726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.dontrotated": {
    resourceKey: "m736974652e6272616e642e646f6e74726f7461746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.dontshadowed": {
    resourceKey: "m736974652e6272616e642e646f6e74736861646f776564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.dontstretched": {
    resourceKey: "m736974652e6272616e642e646f6e74737472657463686564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.dontuseourlogosornames": {
    resourceKey: "m736974652e6272616e642e646f6e747573656f75726c6f676f736f726e616d6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.dontusethemasyourown": {
    resourceKey: "m736974652e6272616e642e646f6e747573657468656d6173796f75726f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.downloadallsolstoneeveryvariantfullsize": {
    resourceKey: "m736974652e6272616e642e646f776e6c6f6164616c6c736f6c73746f6e65657665727976617269616e7466756c6c73697a65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.e8913aon1a1a1a7081pass": {
    resourceKey: "m736974652e6272616e642e6538393133616f6e3161316131613730383170617373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.e8913aonfcf3e4tilecream223": {
    resourceKey: "m736974652e6272616e642e6538393133616f6e66636633653474696c65637265616d323233",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.e8913aonfefcf8surfacecream240": {
    resourceKey: "m736974652e6272616e642e6538393133616f6e66656663663873757266616365637265616d323430",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.e8913aonffffff2461fails": {
    resourceKey: "m736974652e6272616e642e6538393133616f6e666666666666323436316661696c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.fcf3e4": {
    resourceKey: "m736974652e6272616e642e666366336534",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.fefcf8": {
    resourceKey: "m736974652e6272616e642e666566636638",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.fordarkbackgrounds": {
    resourceKey: "m736974652e6272616e642e666f726461726b6261636b67726f756e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.foundations": {
    resourceKey: "m736974652e6272616e642e666f756e646174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.fullcolorforlightbackgrounds": {
    resourceKey: "m736974652e6272616e642e66756c6c636f6c6f72666f726c696768746261636b67726f756e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.fullcolorondarkhighcontrastsurfaces": {
    resourceKey: "m736974652e6272616e642e66756c6c636f6c6f726f6e6461726b68696768636f6e74726173747375726661636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.hex": {
    resourceKey: "m736974652e6272616e642e686578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.horizontallockup": {
    resourceKey: "m736974652e6272616e642e686f72697a6f6e74616c6c6f636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.howthelogoisbuilt": {
    resourceKey: "m736974652e6272616e642e686f777468656c6f676f69736275696c74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.iossourcefullbleedcreamsquareios": {
    resourceKey: "m736974652e6272616e642e696f73736f7572636566756c6c626c656564637265616d737175617265696f73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.lockup": {
    resourceKey: "m736974652e6272616e642e6c6f636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.lockupsolstoneapp": {
    resourceKey: "m736974652e6272616e642e6c6f636b7570736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.lockupsolstoneappwhite": {
    resourceKey: "m736974652e6272616e642e6c6f636b7570736f6c73746f6e656170707768697465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.lockupsolstonehorizontal": {
    resourceKey: "m736974652e6272616e642e6c6f636b7570736f6c73746f6e65686f72697a6f6e74616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.lockupsolstonehorizontalwhite": {
    resourceKey: "m736974652e6272616e642e6c6f636b7570736f6c73746f6e65686f72697a6f6e74616c7768697465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.logoswordmarks": {
    resourceKey: "m736974652e6272616e642e6c6f676f73776f72646d61726b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.mark": {
    resourceKey: "m736974652e6272616e642e6d61726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.markblack": {
    resourceKey: "m736974652e6272616e642e6d61726b626c61636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.markwhite": {
    resourceKey: "m736974652e6272616e642e6d61726b7768697465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.name": {
    resourceKey: "m736974652e6272616e642e6e616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.notsurejustasktheresa": {
    resourceKey: "m736974652e6272616e642e6e6f74737572656a75737461736b74686572657361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.onelogoacrosstheecosystemthesolstone": {
    resourceKey: "m736974652e6272616e642e6f6e656c6f676f6163726f737374686565636f73797374656d746865736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.oneparagraphsolstoneisapersonaljournalplatform": {
    resourceKey: "m736974652e6272616e642e6f6e65706172616772617068736f6c73746f6e65697361706572736f6e616c6a6f75726e616c706c6174666f726d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.onesentenceambientautomaticmemorysoyoucan": {
    resourceKey: "m736974652e6272616e642e6f6e6573656e74656e6365616d6269656e746175746f6d617469636d656d6f7279736f796f7563616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.orangeink": {
    resourceKey: "m736974652e6272616e642e6f72616e6765696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.orangelogovstext": {
    resourceKey: "m736974652e6272616e642e6f72616e67656c6f676f767374657874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.ourpaletteisdefinedinhexfor": {
    resourceKey: "m736974652e6272616e642e6f757270616c657474656973646566696e6564696e686578666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.pagewebsurfacebackgroundneveranicon": {
    resourceKey: "m736974652e6272616e642e70616765776562737572666163656261636b67726f756e646e65766572616e69636f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.pdf": {
    resourceKey: "m736974652e6272616e642e706466",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.png1024": {
    resourceKey: "m736974652e6272616e642e706e6731303234",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.png2048": {
    resourceKey: "m736974652e6272616e642e706e6732303438",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.png512": {
    resourceKey: "m736974652e6272616e642e706e67353132",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.qrcode": {
    resourceKey: "m736974652e6272616e642e7172636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.qrcream": {
    resourceKey: "m736974652e6272616e642e7172637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.qrwhite": {
    resourceKey: "m736974652e6272616e642e71727768697465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.recolored": {
    resourceKey: "m736974652e6272616e642e7265636f6c6f726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.rgb": {
    resourceKey: "m736974652e6272616e642e726762",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.rotated": {
    resourceKey: "m736974652e6272616e642e726f7461746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.scanverifiedwithtwodecodersencodessolstone": {
    resourceKey: "m736974652e6272616e642e7363616e76657269666965647769746874776f6465636f64657273656e636f646573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.secondaryonlyforpurewhitesurfaces": {
    resourceKey: "m736974652e6272616e642e7365636f6e646172796f6e6c79666f727075726577686974657375726661636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.seethefulldesignstoryofthe": {
    resourceKey: "m736974652e6272616e642e73656574686566756c6c64657369676e73746f72796f66746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.shadowed": {
    resourceKey: "m736974652e6272616e642e736861646f776564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.shortamemoryyouragentscanworkfrom": {
    resourceKey: "m736974652e6272616e642e73686f7274616d656d6f7279796f75726167656e747363616e776f726b66726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.singlecolorblackprintlimitedcolor": {
    resourceKey: "m736974652e6272616e642e73696e676c65636f6c6f72626c61636b7072696e746c696d69746564636f6c6f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.slogans": {
    resourceKey: "m736974652e6272616e642e736c6f67616e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solgold": {
    resourceKey: "m736974652e6272616e642e736f6c676f6c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solorange": {
    resourceKey: "m736974652e6272616e642e736f6c6f72616e6765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstoneappiconcream": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e6561707069636f6e637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstoneappiconsquircle": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e6561707069636f6e7371756972636c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstoneappicontransparent": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e6561707069636f6e7472616e73706172656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstoneapplockup": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e656170706c6f636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstoneapplockupwhite": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e656170706c6f636b75707768697465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstoneisapersonaljournalplatformthe": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e65697361706572736f6e616c6a6f75726e616c706c6174666f726d746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstonelogo": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e656c6f676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstonelogoblack": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e656c6f676f626c61636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstonelogowhite": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e656c6f676f7768697465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstoneqrcodecreamencodessolstoneapp": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e657172636f6465637265616d656e636f646573736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstoneqrcodewhitegroundencodessolstone": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e657172636f6465776869746567726f756e64656e636f646573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.solstonesolstoneapp": {
    resourceKey: "m736974652e6272616e642e736f6c73746f6e65736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.stretched": {
    resourceKey: "m736974652e6272616e642e737472657463686564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.surfacecream": {
    resourceKey: "m736974652e6272616e642e73757266616365637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.svg": {
    resourceKey: "m736974652e6272616e642e737667",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thatsthewholestanceandit": {
    resourceKey: "m736974652e6272616e642e746861747374686577686f6c657374616e6365616e646974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thebrandsystemthenumbersthecolors": {
    resourceKey: "m736974652e6272616e642e7468656272616e6473797374656d7468656e756d62657273746865636f6c6f7273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thecreams": {
    resourceKey: "m736974652e6272616e642e746865637265616d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.theinstallediconlookcreamsquirclebaked": {
    resourceKey: "m736974652e6272616e642e746865696e7374616c6c656469636f6e6c6f6f6b637265616d7371756972636c6562616b6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thelogobesidesolstonewithnodomain": {
    resourceKey: "m736974652e6272616e642e7468656c6f676f626573696465736f6c73746f6e65776974686e6f646f6d61696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thelogofullcoloronlight": {
    resourceKey: "m736974652e6272616e642e7468656c6f676f66756c6c636f6c6f726f6e6c69676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thelogosbeams": {
    resourceKey: "m736974652e6272616e642e7468656c6f676f736265616d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.theseassetsarefreetousefor": {
    resourceKey: "m736974652e6272616e642e746865736561737365747361726566726565746f757365666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thesolstonelogoisonerecipeon": {
    resourceKey: "m736974652e6272616e642e746865736f6c73746f6e656c6f676f69736f6e657265636970656f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thesolstonelogoisthesunitself": {
    resourceKey: "m736974652e6272616e642e746865736f6c73746f6e656c6f676f697374686573756e697473656c66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thesolstonelogolockupsappiconcolors": {
    resourceKey: "m736974652e6272616e642e746865736f6c73746f6e656c6f676f6c6f636b75707361707069636f6e636f6c6f7273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thesolstonelogolockupsappiconcolorsx3bd47c51": {
    resourceKey: "m736974652e6272616e642e746865736f6c73746f6e656c6f676f6c6f636b75707361707069636f6e636f6c6f7273783362643437633531",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thesolstonelogosringagraphic": {
    resourceKey: "m736974652e6272616e642e746865736f6c73746f6e656c6f676f7372696e676167726170686963",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thesolstonelogostackedoversolstoneapp": {
    resourceKey: "m736974652e6272616e642e746865736f6c73746f6e656c6f676f737461636b65646f766572736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thesolstonepalettethesolpbcwordmark": {
    resourceKey: "m736974652e6272616e642e746865736f6c73746f6e6570616c65747465746865736f6c706263776f72646d61726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thesolsystem": {
    resourceKey: "m736974652e6272616e642e746865736f6c73797374656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thetwocreamsaredistinctfromthe": {
    resourceKey: "m736974652e6272616e642e74686574776f637265616d7361726564697374696e637466726f6d746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thetypefacescomfortaaandinterareopen": {
    resourceKey: "m736974652e6272616e642e746865747970656661636573636f6d666f72746161616e64696e7465726172656f70656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thewhy": {
    resourceKey: "m736974652e6272616e642e746865776879",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.thispageloadsnothingfromanyoneelse": {
    resourceKey: "m736974652e6272616e642e74686973706167656c6f6164736e6f7468696e6766726f6d616e796f6e65656c7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.tilecream": {
    resourceKey: "m736974652e6272616e642e74696c65637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.using": {
    resourceKey: "m736974652e6272616e642e7573696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.usingthese": {
    resourceKey: "m736974652e6272616e642e7573696e677468657365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.whitefordarkbackgrounds": {
    resourceKey: "m736974652e6272616e642e7768697465666f726461726b6261636b67726f756e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.whitefordarkbackgroundsgarments": {
    resourceKey: "m736974652e6272616e642e7768697465666f726461726b6261636b67726f756e64736761726d656e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brand.windowslinuxtransparenttilecreamcenter": {
    resourceKey: "m736974652e6272616e642e77696e646f77736c696e75787472616e73706172656e7474696c65637265616d63656e746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.abrowserdrawsthemidnightshoweras": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e6162726f7773657264726177737468656d69646e6967687473686f7765726173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.appearance": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e617070656172616e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.dark": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e6461726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.date": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e64617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.dawn": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e6461776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.dayground": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e64617967726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.daygroundsolstone": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e64617967726f756e64736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.dusk": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e6475736b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.foragents": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e666f726167656e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.light": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e6c69676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.n2026solpbcyourjournalisalways": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e6e32303236736f6c706263796f75726a6f75726e616c6973616c77617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.noon": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e6e6f6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.now": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e6e6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.place": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e706c616365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.playadayin20seconds": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e706c617961646179696e32307365636f6e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.playground": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e706c617967726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.screen": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e73637265656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.showtheconstruction": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e73686f77746865636f6e737472756374696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.solarmidnight": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e736f6c61726d69646e69676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.tablet": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e7461626c6574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.thebrandsystem": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e7468656272616e6473797374656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.thedaygroundissolstonesbackgroundthe": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e74686564617967726f756e646973736f6c73746f6e65736261636b67726f756e64746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.theplaygroundrunsthesameengineas": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e746865706c617967726f756e6472756e7374686573616d65656e67696e656173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.thespec": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e74686573706563",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.thewatchhasnolightmodeso": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e74686577617463686861736e6f6c696768746d6f6465736f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.timeofday": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e74696d656f66646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.tryitdragthroughadayswitch": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e7472796974647261677468726f75676861646179737769746368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.usingthedayground": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e7573696e6774686564617967726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.watch": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e7761746368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.watchtheshower": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e776174636874686573686f776572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.web": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e776562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.branddayground.workedoutonyourdevicefromits": {
    resourceKey: "m736974652e6272616e6464617967726f756e642e776f726b65646f75746f6e796f757264657669636566726f6d697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.acrosstenrepeatsthelogobecomes330": {
    resourceKey: "m736974652e6272616e646c6f676f2e6163726f737374656e726570656174737468656c6f676f6265636f6d6573333330",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.air124124": {
    resourceKey: "m736974652e6272616e646c6f676f2e616972313234313234",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.air74": {
    resourceKey: "m736974652e6272616e646c6f676f2e6169723734",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.aironthebasecircle": {
    resourceKey: "m736974652e6272616e646c6f676f2e6169726f6e74686562617365636972636c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.allfiveboundariessharethesameorigin": {
    resourceKey: "m736974652e6272616e646c6f676f2e616c6c66697665626f756e646172696573736861726574686573616d656f726967696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.alternatingtipsrevealtworegularpentagons": {
    resourceKey: "m736974652e6272616e646c6f676f2e616c7465726e6174696e677469707372657665616c74776f726567756c617270656e7461676f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.asinglerayrepeatedtentimesa": {
    resourceKey: "m736974652e6272616e646c6f676f2e6173696e676c65726179726570656174656474656e74696d657361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.base852": {
    resourceKey: "m736974652e6272616e646c6f676f2e62617365383532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.base852xa7975ea5": {
    resourceKey: "m736974652e6272616e646c6f676f2e62617365383532786137393735656135",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.baseanchor": {
    resourceKey: "m736974652e6272616e646c6f676f2e62617365616e63686f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.basecirclecadence": {
    resourceKey: "m736974652e6272616e646c6f676f2e62617365636972636c65636164656e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.center": {
    resourceKey: "m736974652e6272616e646c6f676f2e63656e746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.chosen": {
    resourceKey: "m736974652e6272616e646c6f676f2e63686f73656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.closedformsareconstructiontargetstheselected": {
    resourceKey: "m736974652e6272616e646c6f676f2e636c6f736564666f726d73617265636f6e737472756374696f6e7461726765747374686573656c6563746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.closeindex": {
    resourceKey: "m736974652e6272616e646c6f676f2e636c6f7365696e646578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.completedlogowithring": {
    resourceKey: "m736974652e6272616e646c6f676f2e636f6d706c657465646c6f676f7769746872696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.constructionintenplates": {
    resourceKey: "m736974652e6272616e646c6f676f2e636f6e737472756374696f6e696e74656e706c61746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.constructionpresentation20260817": {
    resourceKey: "m736974652e6272616e646c6f676f2e636f6e737472756374696f6e70726573656e746174696f6e3230323630383137",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.decagonandtwopentagonsinsidetheselected": {
    resourceKey: "m736974652e6272616e646c6f676f2e64656361676f6e616e6474776f70656e7461676f6e73696e7369646574686573656c6563746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.determined": {
    resourceKey: "m736974652e6272616e646c6f676f2e64657465726d696e6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.e8913a": {
    resourceKey: "m736974652e6272616e646c6f676f2e653839313361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.each36basesectoriselevenparts": {
    resourceKey: "m736974652e6272616e646c6f676f2e65616368333662617365736563746f726973656c6576656e7061727473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.exactsrgbbytesexacthueanglesno": {
    resourceKey: "m736974652e6272616e646c6f676f2e65786163747372676262797465736578616374687565616e676c65736e6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.exactsvgdownload": {
    resourceKey: "m736974652e6272616e646c6f676f2e6578616374737667646f776e6c6f6164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.ffcc33": {
    resourceKey: "m736974652e6272616e646c6f676f2e666663633333",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.fivealternatingrays": {
    resourceKey: "m736974652e6272616e646c6f676f2e66697665616c7465726e6174696e6772617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.fiveconcentricradiidescribetheselectedsilhouette": {
    resourceKey: "m736974652e6272616e646c6f676f2e66697665636f6e63656e747269637261646969646573637269626574686573656c656374656473696c686f7565747465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.fiveradiusconstructionfield": {
    resourceKey: "m736974652e6272616e646c6f676f2e66697665726164697573636f6e737472756374696f6e6669656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.geometryselected20260815downloadsha256": {
    resourceKey: "m736974652e6272616e646c6f676f2e67656f6d6574727973656c65637465643230323630383135646f776e6c6f6164736861323536",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.goldhue45": {
    resourceKey: "m736974652e6272616e646c6f676f2e676f6c646875653435",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.greensitsat12ofthe": {
    resourceKey: "m736974652e6272616e646c6f676f2e677265656e73697473617431326f66746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.greensitsat34ofthe": {
    resourceKey: "m736974652e6272616e646c6f676f2e677265656e73697473617433346f66746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.identitybyrepetitionnoindependentlydrawncopies": {
    resourceKey: "m736974652e6272616e646c6f676f2e6964656e74697479627972657065746974696f6e6e6f696e646570656e64656e746c79647261776e636f70696573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.inner27452": {
    resourceKey: "m736974652e6272616e646c6f676f2e696e6e65723237343532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.inneredge27452": {
    resourceKey: "m736974652e6272616e646c6f676f2e696e6e6572656467653237343532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.insideeitherpentagondiagonalsideisthe": {
    resourceKey: "m736974652e6272616e646c6f676f2e696e7369646565697468657270656e7461676f6e646961676f6e616c736964656973746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.intendedcadencearoundthefullbasecircle": {
    resourceKey: "m736974652e6272616e646c6f676f2e696e74656e646564636164656e636561726f756e6474686566756c6c62617365636972636c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.intheclosedformconstructionbothboundaries": {
    resourceKey: "m736974652e6272616e646c6f676f2e696e746865636c6f736564666f726d636f6e737472756374696f6e626f7468626f756e646172696573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.inwardnotsoft": {
    resourceKey: "m736974652e6272616e646c6f676f2e696e776172646e6f74736f6674",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.inwardraycurvecomparedwithastraight": {
    resourceKey: "m736974652e6272616e646c6f676f2e696e776172647261796375727665636f6d706172656477697468617374726169676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.iscarriedbythetiplatticebefore": {
    resourceKey: "m736974652e6272616e646c6f676f2e69736361727269656462797468657469706c6174746963656265666f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.logoat16pixels": {
    resourceKey: "m736974652e6272616e646c6f676f2e6c6f676f61743136706978656c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.logoat22pixels": {
    resourceKey: "m736974652e6272616e646c6f676f2e6c6f676f61743232706978656c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.logoat32pixels": {
    resourceKey: "m736974652e6272616e646c6f676f2e6c6f676f61743332706978656c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.logoat48pixels": {
    resourceKey: "m736974652e6272616e646c6f676f2e6c6f676f61743438706978656c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.logoat64pixels": {
    resourceKey: "m736974652e6272616e646c6f676f2e6c6f676f61743634706978656c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n01logo": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e30316c6f676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n02grammar": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e30326772616d6d6172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n02sourcegrammar": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3032736f757263656772616d6d6172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n03constructionfieldclosedformtargets": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3033636f6e737472756374696f6e6669656c64636c6f736564666f726d74617267657473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n03field": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e30336669656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n04curve": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e30346375727665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n04rayanatomysourceprecisiontarget": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3034726179616e61746f6d79736f75726365707265636973696f6e746172676574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n05cadence": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3035636164656e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n05tenraycadencesourceprecisiontarget": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e303574656e726179636164656e6365736f75726365707265636973696f6e746172676574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n06ring": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e303672696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n06theringdeterminedclosedformtarget": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e303674686572696e6764657465726d696e6564636c6f736564666f726d746172676574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n07cancellation": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e303763616e63656c6c6174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n07targetcancellation": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e303774617267657463616e63656c6c6174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n08thegoldenskeleton": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3038746865676f6c64656e736b656c65746f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n09colour": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3039636f6c6f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n09integercolour": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3039696e7465676572636f6c6f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n10scale": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e31307363616c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n10theresult": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3130746865726573756c74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n1112ray": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e31313132726179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n19aroundonecenter": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e313961726f756e646f6e6563656e746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n1circle": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e31636972636c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n1path": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3170617468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n2sin181decagonside27": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3273696e31383164656361676f6e736964653237",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n33ray": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3333726179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n36apart": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e33366170617274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n453015ofwarmseparation": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3435333031356f667761726d73657061726174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n74air": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e3734616972",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.n9rotations": {
    resourceKey: "m736974652e6272616e646c6f676f2e6e39726f746174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onecenter": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e6563656e746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onehalfofonepercentofthe": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e6568616c666f666f6e6570657263656e746f66746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.oneirrationalunitmovesthroughtheradii": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e656972726174696f6e616c756e69746d6f7665737468726f7567687468657261646969",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onemirroredray": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e656d6972726f726564726179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onepathonecircleninerotations": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e65706174686f6e65636972636c656e696e65726f746174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onequarterofthesevenunitcenter": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e65717561727465726f66746865736576656e756e697463656e746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.oneray": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e65726179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onerayfiveraysandtenrays": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e657261796669766572617973616e6474656e72617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onerayrepeatedtentimesonering": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e65726179726570656174656474656e74696d65736f6e6572696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onesector": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e65736563746f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onesourceray": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e65736f75726365726179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.onlythesidecontourchanges": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f6e6c7974686573696465636f6e746f75726368616e676573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.openindex": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f70656e696e646578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.orangehue30": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f72616e67656875653330",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.outer25452": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f757465723235343532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.outer25452x3e064907": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f757465723235343532783365303634393037",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.outeredge25452": {
    resourceKey: "m736974652e6272616e646c6f676f2e6f75746572656467653235343532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.quadraticbziergeometryopticalcorrectionexpressed": {
    resourceKey: "m736974652e6272616e646c6f676f2e717561647261746963627a69657267656f6d657472796f70746963616c636f7272656374696f6e657870726573736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.quadraticcontrol": {
    resourceKey: "m736974652e6272616e646c6f676f2e717561647261746963636f6e74726f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.r132": {
    resourceKey: "m736974652e6272616e646c6f676f2e72313332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.radialcutawayshowingtheraybaseand": {
    resourceKey: "m736974652e6272616e646c6f676f2e72616469616c6375746177617973686f77696e6774686572617962617365616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.radialnumberlinefromthelogocenter": {
    resourceKey: "m736974652e6272616e646c6f676f2e72616469616c6e756d6265726c696e6566726f6d7468656c6f676f63656e746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.raybase": {
    resourceKey: "m736974652e6272616e646c6f676f2e72617962617365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.raybase852": {
    resourceKey: "m736974652e6272616e646c6f676f2e72617962617365383532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.raybaseminusringcenter": {
    resourceKey: "m736974652e6272616e646c6f676f2e726179626173656d696e757372696e6763656e746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.rayonthebasecircle": {
    resourceKey: "m736974652e6272616e646c6f676f2e7261796f6e74686562617365636972636c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.ring132": {
    resourceKey: "m736974652e6272616e646c6f676f2e72696e67313332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.ringcenter132": {
    resourceKey: "m736974652e6272616e646c6f676f2e72696e6763656e746572313332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.ringcenterline": {
    resourceKey: "m736974652e6272616e646c6f676f2e72696e6763656e7465726c696e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.ringinneredge": {
    resourceKey: "m736974652e6272616e646c6f676f2e72696e67696e6e657265646765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.ringouteredge": {
    resourceKey: "m736974652e6272616e646c6f676f2e72696e676f7574657265646765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.sameirrationaloffset": {
    resourceKey: "m736974652e6272616e646c6f676f2e73616d656972726174696f6e616c6f6666736574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.sametipsamebasesame33arc": {
    resourceKey: "m736974652e6272616e646c6f676f2e73616d6574697073616d656261736573616d653333617263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.selectedaligneddistinctringsollogo": {
    resourceKey: "m736974652e6272616e646c6f676f2e73656c6563746564616c69676e656464697374696e637472696e67736f6c6c6f676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.selectedcurve": {
    resourceKey: "m736974652e6272616e646c6f676f2e73656c65637465646375727665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.selectedgeometryembeddedexactlythisdeckexplains": {
    resourceKey: "m736974652e6272616e646c6f676f2e73656c656374656467656f6d65747279656d62656464656465786163746c79746869736465636b6578706c61696e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.selectedgeometrystaticselfcontainedanddrawn": {
    resourceKey: "m736974652e6272616e646c6f676f2e73656c656374656467656f6d6574727973746174696373656c66636f6e7461696e6564616e64647261776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.selectedlogoatnativepixelsizes": {
    resourceKey: "m736974652e6272616e646c6f676f2e73656c65637465646c6f676f61746e6174697665706978656c73697a6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.slideindex": {
    resourceKey: "m736974652e6272616e646c6f676f2e736c696465696e646578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.sourceconstructionsummary": {
    resourceKey: "m736974652e6272616e646c6f676f2e736f75726365636f6e737472756374696f6e73756d6d617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.straightreference": {
    resourceKey: "m736974652e6272616e646c6f676f2e73747261696768747265666572656e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.stroke512": {
    resourceKey: "m736974652e6272616e646c6f676f2e7374726f6b65353132",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.symmetryd10": {
    resourceKey: "m736974652e6272616e646c6f676f2e73796d6d65747279643130",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tenpointscontaintwopentagonssobelongs": {
    resourceKey: "m736974652e6272616e646c6f676f2e74656e706f696e7473636f6e7461696e74776f70656e7461676f6e73736f62656c6f6e6773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tenrays": {
    resourceKey: "m736974652e6272616e646c6f676f2e74656e72617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tenrepeatedrays": {
    resourceKey: "m736974652e6272616e646c6f676f2e74656e726570656174656472617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theadjustmentissmallenoughtopreserve": {
    resourceKey: "m736974652e6272616e646c6f676f2e74686561646a7573746d656e746973736d616c6c656e6f756768746f7072657365727665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theairbetweenrayandring": {
    resourceKey: "m736974652e6272616e646c6f676f2e7468656169726265747765656e726179616e6472696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.thealigneddistinctring": {
    resourceKey: "m736974652e6272616e646c6f676f2e746865616c69676e656464697374696e637472696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.thealigneddistinctringsollogoconstruction": {
    resourceKey: "m736974652e6272616e646c6f676f2e746865616c69676e656464697374696e637472696e67736f6c6c6f676f636f6e737472756374696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theanchorsstayfixedthesideslean": {
    resourceKey: "m736974652e6272616e646c6f676f2e746865616e63686f727373746179666978656474686573696465736c65616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.thecompletelogo": {
    resourceKey: "m736974652e6272616e646c6f676f2e746865636f6d706c6574656c6f676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.thecontroltargetis27100the": {
    resourceKey: "m736974652e6272616e646c6f676f2e746865636f6e74726f6c74617267657469733237313030746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.thedistinctringcenterline": {
    resourceKey: "m736974652e6272616e646c6f676f2e74686564697374696e637472696e6763656e7465726c696e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theirrationaltermsshapethefieldtheir": {
    resourceKey: "m736974652e6272616e646c6f676f2e7468656972726174696f6e616c7465726d7373686170657468656669656c647468656972",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.themathisthebalance": {
    resourceKey: "m736974652e6272616e646c6f676f2e7468656d617468697374686562616c616e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theonlyauthoredcontour": {
    resourceKey: "m736974652e6272616e646c6f676f2e7468656f6e6c79617574686f726564636f6e746f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theonlystrokethatsatisfiesbothchoices": {
    resourceKey: "m736974652e6272616e646c6f676f2e7468656f6e6c797374726f6b6574686174736174697366696573626f746863686f69636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theraybaseandringouteredge": {
    resourceKey: "m736974652e6272616e646c6f676f2e74686572617962617365616e6472696e676f7574657265646765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theselectedlogoisfadedwhilethe": {
    resourceKey: "m736974652e6272616e646c6f676f2e74686573656c65637465646c6f676f697366616465647768696c65746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theselectedlogooverlaidwiththetip": {
    resourceKey: "m736974652e6272616e646c6f676f2e74686573656c65637465646c6f676f6f7665726c61696477697468746865746970",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.theselectedquadraticrayoverlaysastraight": {
    resourceKey: "m736974652e6272616e646c6f676f2e74686573656c65637465647175616472617469637261796f7665726c617973617374726169676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.thestrokeiswhatremainsafterthe": {
    resourceKey: "m736974652e6272616e646c6f676f2e7468657374726f6b6569737768617472656d61696e736166746572746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.thetenraytipsmakearegular": {
    resourceKey: "m736974652e6272616e646c6f676f2e74686574656e726179746970736d616b6561726567756c6172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.thetwohuesaremadefromsmall": {
    resourceKey: "m736974652e6272616e646c6f676f2e74686574776f687565736172656d61646566726f6d736d616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.thirtysixdegreesectordividedintothirty": {
    resourceKey: "m736974652e6272616e646c6f676f2e746869727479736978646567726565736563746f7264697669646564696e746f746869727479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tip272": {
    resourceKey: "m736974652e6272616e646c6f676f2e746970323732",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tip272xd0cadb7c": {
    resourceKey: "m736974652e6272616e646c6f676f2e746970323732786430636164623763",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tipanchor": {
    resourceKey: "m736974652e6272616e646c6f676f2e746970616e63686f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tipcircle": {
    resourceKey: "m736974652e6272616e646c6f676f2e746970636972636c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tipcircle273": {
    resourceKey: "m736974652e6272616e646c6f676f2e746970636972636c65323733",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tipminusringcenter": {
    resourceKey: "m736974652e6272616e646c6f676f2e7469706d696e757372696e6763656e746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.tipsat36intervalsmakeoneregular": {
    resourceKey: "m736974652e6272616e646c6f676f2e7469707361743336696e74657276616c736d616b656f6e65726567756c6172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.twochoicesdeterminethethirdquantity": {
    resourceKey: "m736974652e6272616e646c6f676f2e74776f63686f6963657364657465726d696e6574686574686972647175616e74697479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.twoneighboringradii": {
    resourceKey: "m736974652e6272616e646c6f676f2e74776f6e65696768626f72696e677261646969",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.visiblebowtarget": {
    resourceKey: "m736974652e6272616e646c6f676f2e76697369626c65626f77746172676574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandlogo.w512": {
    resourceKey: "m736974652e6272616e646c6f676f2e77353132",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamhangtagaplainstring": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d68616e6774616761706c61696e737472696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamnotebookcoverthelogocomes": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d6e6f7465626f6f6b636f7665727468656c6f676f636f6d6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamnotebookcoverthelogogoes": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d6e6f7465626f6f6b636f7665727468656c6f676f676f6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamphonecasewiththelogo": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d70686f6e6563617365776974687468656c6f676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamphonecasewiththesolar": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d70686f6e656361736577697468746865736f6c6172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreampocketcloththelogocomes": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d706f636b6574636c6f74687468656c6f676f636f6d6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamteethelogocomesin": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d7465657468656c6f676f636f6d6573696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamteethelogogoesdown": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d7465657468656c6f676f676f6573646f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamteewiththesolarinstrument": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d74656577697468746865736f6c6172696e737472756d656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamtotethelogocomesin": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d746f74657468656c6f676f636f6d6573696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.acreamtotethelogogoesdown": {
    resourceKey: "m736974652e6272616e646d657263682e61637265616d746f74657468656c6f676f676f6573646f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.aninkteethelogocomesin": {
    resourceKey: "m736974652e6272616e646d657263682e616e696e6b7465657468656c6f676f636f6d6573696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.aninkteethelogogoesdown": {
    resourceKey: "m736974652e6272616e646d657263682e616e696e6b7465657468656c6f676f676f6573646f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.aninkteewiththesolarinstrument": {
    resourceKey: "m736974652e6272616e646d657263682e616e696e6b74656577697468746865736f6c6172696e737472756d656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.anotebooksendpapersthefieldat": {
    resourceKey: "m736974652e6272616e646d657263682e616e6f7465626f6f6b73656e647061706572737468656669656c646174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.aroundclothoninkwiththe": {
    resourceKey: "m736974652e6272616e646d657263682e61726f756e64636c6f74686f6e696e6b77697468746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.artsendvectorartwitheveryshape": {
    resourceKey: "m736974652e6272616e646d657263682e61727473656e64766563746f726172747769746865766572797368617065",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.asetofthreemorningnoonand": {
    resourceKey: "m736974652e6272616e646d657263682e617365746f6674687265656d6f726e696e676e6f6f6e616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.ashirtcarriesthelogoasa": {
    resourceKey: "m736974652e6272616e646d657263682e617368697274636172726965737468656c6f676f617361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.asquarecreamclothwiththestacked": {
    resourceKey: "m736974652e6272616e646d657263682e61737175617265637265616d636c6f746877697468746865737461636b6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.asquareinkclothwiththestacked": {
    resourceKey: "m736974652e6272616e646d657263682e61737175617265696e6b636c6f746877697468746865737461636b6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.cloths": {
    resourceKey: "m736974652e6272616e646d657263682e636c6f746873",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.colorshowmanyanobjectmayuse": {
    resourceKey: "m736974652e6272616e646d657263682e636f6c6f7273686f776d616e79616e6f626a6563746d6179757365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.coversunrise": {
    resourceKey: "m736974652e6272616e646d657263682e636f76657273756e72697365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.coversunset": {
    resourceKey: "m736974652e6272616e646d657263682e636f76657273756e736574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.cream": {
    resourceKey: "m736974652e6272616e646d657263682e637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.endpapersthefieldatfulldose": {
    resourceKey: "m736974652e6272616e646d657263682e656e647061706572737468656669656c64617466756c6c646f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.evening": {
    resourceKey: "m736974652e6272616e646d657263682e6576656e696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.eveningcream": {
    resourceKey: "m736974652e6272616e646d657263682e6576656e696e67637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.eveningink": {
    resourceKey: "m736974652e6272616e646d657263682e6576656e696e67696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.everysizedistanceandplaceonthis": {
    resourceKey: "m736974652e6272616e646d657263682e657665727973697a6564697374616e6365616e64706c6163656f6e74686973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.howthebrandsystemgoesontophysical": {
    resourceKey: "m736974652e6272616e646d657263682e686f777468656272616e6473797374656d676f65736f6e746f706879736963616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.howthesolstonebrandsystemgoesonto": {
    resourceKey: "m736974652e6272616e646d657263682e686f77746865736f6c73746f6e656272616e6473797374656d676f65736f6e746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.ink": {
    resourceKey: "m736974652e6272616e646d657263682e696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.linefloorsnolinethinnerthan0": {
    resourceKey: "m736974652e6272616e646d657263682e6c696e65666c6f6f72736e6f6c696e657468696e6e65727468616e30",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.merch": {
    resourceKey: "m736974652e6272616e646d657263682e6d65726368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.merchsolstone": {
    resourceKey: "m736974652e6272616e646d657263682e6d65726368736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.morning": {
    resourceKey: "m736974652e6272616e646d657263682e6d6f726e696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.morningcream": {
    resourceKey: "m736974652e6272616e646d657263682e6d6f726e696e67637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.morningink": {
    resourceKey: "m736974652e6272616e646d657263682e6d6f726e696e67696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.notebooks": {
    resourceKey: "m736974652e6272616e646d657263682e6e6f7465626f6f6b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.oninkstockcreamlinesneedan": {
    resourceKey: "m736974652e6272616e646d657263682e6f6e696e6b73746f636b637265616d6c696e65736e656564616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.pocketcream": {
    resourceKey: "m736974652e6272616e646d657263682e706f636b6574637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.print": {
    resourceKey: "m736974652e6272616e646d657263682e7072696e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.proofsaskforadigitalproofbefore": {
    resourceKey: "m736974652e6272616e646d657263682e70726f6f667361736b666f72616469676974616c70726f6f666265666f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.roundink": {
    resourceKey: "m736974652e6272616e646d657263682e726f756e64696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.shirts": {
    resourceKey: "m736974652e6272616e646d657263682e736869727473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.squarecream": {
    resourceKey: "m736974652e6272616e646d657263682e737175617265637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.squareink": {
    resourceKey: "m736974652e6272616e646d657263682e737175617265696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.sunrise": {
    resourceKey: "m736974652e6272616e646d657263682e73756e72697365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.sunset": {
    resourceKey: "m736974652e6272616e646d657263682e73756e736574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thecovercarriesthelogoatsunrise": {
    resourceKey: "m736974652e6272616e646d657263682e746865636f766572636172726965737468656c6f676f617473756e72697365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thedrawingacrossthefrontstartingaround": {
    resourceKey: "m736974652e6272616e646d657263682e74686564726177696e676163726f737374686566726f6e747374617274696e6761726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.theeveningmugthelogogoesdown": {
    resourceKey: "m736974652e6272616e646d657263682e7468656576656e696e676d75677468656c6f676f676f6573646f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thehangtag": {
    resourceKey: "m736974652e6272616e646d657263682e74686568616e67746167",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thelogoat1000": {
    resourceKey: "m736974652e6272616e646d657263682e7468656c6f676f617431303030",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thelogoatonetimeofday": {
    resourceKey: "m736974652e6272616e646d657263682e7468656c6f676f61746f6e6574696d656f66646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thelogocomesinatthetop": {
    resourceKey: "m736974652e6272616e646d657263682e7468656c6f676f636f6d6573696e6174746865746f70",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.themorningandeveningtees": {
    resourceKey: "m736974652e6272616e646d657263682e7468656d6f726e696e67616e646576656e696e6774656573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.themorningmugthelogocomesin": {
    resourceKey: "m736974652e6272616e646d657263682e7468656d6f726e696e676d75677468656c6f676f636f6d6573696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.themug": {
    resourceKey: "m736974652e6272616e646d657263682e7468656d7567",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thenoonmugthelogohighin": {
    resourceKey: "m736974652e6272616e646d657263682e7468656e6f6f6e6d75677468656c6f676f68696768696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thephonecase": {
    resourceKey: "m736974652e6272616e646d657263682e74686570686f6e6563617365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.theroundclothcarriesthesolarinstrument": {
    resourceKey: "m736974652e6272616e646d657263682e746865726f756e64636c6f746863617272696573746865736f6c6172696e737472756d656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thesolarinstrument": {
    resourceKey: "m736974652e6272616e646d657263682e746865736f6c6172696e737472756d656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thesolarinstrumentstartswith11": {
    resourceKey: "m736974652e6272616e646d657263682e746865736f6c6172696e737472756d656e74737461727473776974683131",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thesolarinstrumenttee": {
    resourceKey: "m736974652e6272616e646d657263682e746865736f6c6172696e737472756d656e74746565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thestackedlockupontilecreambelow": {
    resourceKey: "m736974652e6272616e646d657263682e746865737461636b65646c6f636b75706f6e74696c65637265616d62656c6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.thetimesofdaymug": {
    resourceKey: "m736974652e6272616e646d657263682e74686574696d65736f666461796d7567",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.tintsgosolidahairlinedrawnas": {
    resourceKey: "m736974652e6272616e646d657263682e74696e7473676f736f6c696461686169726c696e65647261776e6173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.totes": {
    resourceKey: "m736974652e6272616e646d657263682e746f746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandmerch.twooptionsbothrightthesolarinstrument": {
    resourceKey: "m736974652e6272616e646d657263682e74776f6f7074696f6e73626f74687269676874746865736f6c6172696e737472756d656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandscript.copied": {
    resourceKey: "m736974652e6272616e647363726970742e636f70696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandscript.copyfailed": {
    resourceKey: "m736974652e6272616e647363726970742e636f70796661696c6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandscript.selectandcopy": {
    resourceKey: "m736974652e6272616e647363726970742e73656c656374616e64636f7079",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.abuiltaccentispartofhow": {
    resourceKey: "m736974652e6272616e6473797374656d2e616275696c74616363656e746973706172746f66686f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.amemoryyouragentscanworkfrom": {
    resourceKey: "m736974652e6272616e6473797374656d2e616d656d6f7279796f75726167656e747363616e776f726b66726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.anobject": {
    resourceKey: "m736974652e6272616e6473797374656d2e616e6f626a656374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.anobjectisagroundonelogo": {
    resourceKey: "m736974652e6272616e6473797374656d2e616e6f626a65637469736167726f756e646f6e656c6f676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.anobjectusesoneortwocolors": {
    resourceKey: "m736974652e6272616e6473797374656d2e616e6f626a656374757365736f6e656f7274776f636f6c6f7273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.asyoulookattheobjectthe": {
    resourceKey: "m736974652e6272616e6473797374656d2e6173796f756c6f6f6b61747468656f626a656374746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.atimeofday": {
    resourceKey: "m736974652e6272616e6473797374656d2e6174696d656f66646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.bodyinter17pxink": {
    resourceKey: "m736974652e6272616e6473797374656d2e626f6479696e74657231377078696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.brass": {
    resourceKey: "m736974652e6272616e6473797374656d2e6272617373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.clearspace": {
    resourceKey: "m736974652e6272616e6473797374656d2e636c6561727370616365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.colors": {
    resourceKey: "m736974652e6272616e6473797374656d2e636f6c6f7273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.colorsandgrounds": {
    resourceKey: "m736974652e6272616e6473797374656d2e636f6c6f7273616e6467726f756e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.displaycomfortaabold": {
    resourceKey: "m736974652e6272616e6473797374656d2e646973706c6179636f6d666f72746161626f6c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.efe4cfe4d6bc": {
    resourceKey: "m736974652e6272616e6473797374656d2e656665346366653464366263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.eveningthelogogoesdownatthe": {
    resourceKey: "m736974652e6272616e6473797374656d2e6576656e696e677468656c6f676f676f6573646f776e6174746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.everythingsolstoneisdrawnwithbeyondthe": {
    resourceKey: "m736974652e6272616e6473797374656d2e65766572797468696e67736f6c73746f6e656973647261776e776974686265796f6e64746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.eyebrowinterbold13pxorangeink": {
    resourceKey: "m736974652e6272616e6473797374656d2e65796562726f77696e746572626f6c64313370786f72616e6765696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.fromtilecreamforadebossor": {
    resourceKey: "m736974652e6272616e6473797374656d2e66726f6d74696c65637265616d666f72616465626f73736f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.grounds": {
    resourceKey: "m736974652e6272616e6473797374656d2e67726f756e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.hardwareandengravingneveranink": {
    resourceKey: "m736974652e6272616e6473797374656d2e6861726477617265616e64656e67726176696e676e65766572616e696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.headinginterbold28px001": {
    resourceKey: "m736974652e6272616e6473797374656d2e68656164696e67696e746572626f6c6432387078303031",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.howitworks": {
    resourceKey: "m736974652e6272616e6473797374656d2e686f776974776f726b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.howthelogoitselfisbuilt": {
    resourceKey: "m736974652e6272616e6473797374656d2e686f777468656c6f676f697473656c6669736275696c74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.inks": {
    resourceKey: "m736974652e6272616e6473797374656d2e696e6b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.insidefulldose": {
    resourceKey: "m736974652e6272616e6473797374656d2e696e7369646566756c6c646f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.inthelogoandthefieldangles": {
    resourceKey: "m736974652e6272616e6473797374656d2e696e7468656c6f676f616e647468656669656c64616e676c6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.kind": {
    resourceKey: "m736974652e6272616e6473797374656d2e6b696e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.ledeinter19pxsoftink": {
    resourceKey: "m736974652e6272616e6473797374656d2e6c656465696e74657231397078736f6674696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.liketherestofthebrandpages": {
    resourceKey: "m736974652e6272616e6473797374656d2e6c696b65746865726573746f667468656272616e647061676573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.material": {
    resourceKey: "m736974652e6272616e6473797374656d2e6d6174657269616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.metainter135pxfaintink": {
    resourceKey: "m736974652e6272616e6473797374656d2e6d657461696e74657231333570786661696e74696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.midday": {
    resourceKey: "m736974652e6272616e6473797374656d2e6d6964646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.middaythelogoatthetopof": {
    resourceKey: "m736974652e6272616e6473797374656d2e6d69646461797468656c6f676f6174746865746f706f66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.morningthelogocomesinatthe": {
    resourceKey: "m736974652e6272616e6473797374656d2e6d6f726e696e677468656c6f676f636f6d6573696e6174746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.numbers": {
    resourceKey: "m736974652e6272616e6473797374656d2e6e756d62657273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.onanobjectlinesstopabout3": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f6e616e6f626a6563746c696e657373746f7061626f757433",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.onanobjectthesolarinstrumentclose": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f6e616e6f626a656374746865736f6c6172696e737472756d656e74636c6f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.onanobjectthewordcomesfrom": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f6e616e6f626a656374746865776f7264636f6d657366726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.onascreenkeeponeringradius": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f6e6173637265656e6b6565706f6e6572696e67726164697573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.onascreenthelogocrossesthe": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f6e6173637265656e7468656c6f676f63726f73736573746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.onascreenthelogowitha": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f6e6173637265656e7468656c6f676f7769746861",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.onelogoperobjectitssizeand": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f6e656c6f676f7065726f626a65637469747373697a65616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.onscreenthehairlineisinkat": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f6e73637265656e746865686169726c696e656973696e6b6174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.ontheoutsideofanobjectthe": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f6e7468656f7574736964656f66616e6f626a656374746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.outsideconstructiondose": {
    resourceKey: "m736974652e6272616e6473797374656d2e6f757473696465636f6e737472756374696f6e646f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.physicalthingsstartonalightground": {
    resourceKey: "m736974652e6272616e6473797374656d2e706879736963616c7468696e677373746172746f6e616c6967687467726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.retiredandnotusedonanythingnew": {
    resourceKey: "m736974652e6272616e6473797374656d2e72657469726564616e646e6f74757365646f6e616e797468696e676e6577",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.seehowagentsreadit": {
    resourceKey: "m736974652e6272616e6473797374656d2e736565686f776167656e7473726561646974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.sixdatepathsfromthelongestday": {
    resourceKey: "m736974652e6272616e6473797374656d2e73697864617465706174687366726f6d7468656c6f6e67657374646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.solgoldffcc33solorangee8913a": {
    resourceKey: "m736974652e6272616e6473797374656d2e736f6c676f6c64666663633333736f6c6f72616e6765653839313361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.textactioninterbold16pxorange": {
    resourceKey: "m736974652e6272616e6473797374656d2e74657874616374696f6e696e746572626f6c64313670786f72616e6765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thebrandsystemsolstone": {
    resourceKey: "m736974652e6272616e6473797374656d2e7468656272616e6473797374656d736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thedrawing": {
    resourceKey: "m736974652e6272616e6473797374656d2e74686564726177696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thedrawingthesolarinstrument": {
    resourceKey: "m736974652e6272616e6473797374656d2e74686564726177696e67746865736f6c6172696e737472756d656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thefield": {
    resourceKey: "m736974652e6272616e6473797374656d2e7468656669656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thefieldatconstructiondoseinkoutlines": {
    resourceKey: "m736974652e6272616e6473797374656d2e7468656669656c646174636f6e737472756374696f6e646f7365696e6b6f75746c696e6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thefieldatfulldosethesame": {
    resourceKey: "m736974652e6272616e6473797374656d2e7468656669656c64617466756c6c646f736574686573616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thefieldistheothergraphicit": {
    resourceKey: "m736974652e6272616e6473797374656d2e7468656669656c6469737468656f74686572677261706869636974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thegraphicisthesolarinstrumentor": {
    resourceKey: "m736974652e6272616e6473797374656d2e746865677261706869636973746865736f6c6172696e737472756d656e746f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.theline": {
    resourceKey: "m736974652e6272616e6473797374656d2e7468656c696e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thelogoscolorsandthecolors": {
    resourceKey: "m736974652e6272616e6473797374656d2e7468656c6f676f73636f6c6f7273616e64746865636f6c6f7273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thelogowiththesevenradiias": {
    resourceKey: "m736974652e6272616e6473797374656d2e7468656c6f676f77697468746865736576656e72616469696173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thenumbers": {
    resourceKey: "m736974652e6272616e6473797374656d2e7468656e756d62657273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thepaletteisclosedfourgroundstwo": {
    resourceKey: "m736974652e6272616e6473797374656d2e74686570616c657474656973636c6f736564666f757267726f756e647374776f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thereisonelineweightthehairline": {
    resourceKey: "m736974652e6272616e6473797374656d2e746865726569736f6e656c696e65776569676874746865686169726c696e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thesametermsaseverythingonthe": {
    resourceKey: "m736974652e6272616e6473797374656d2e74686573616d657465726d73617365766572797468696e676f6e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thesevenradiiascirclesthefive": {
    resourceKey: "m736974652e6272616e6473797374656d2e746865736576656e72616469696173636972636c657374686566697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thesolarinstrumentcreamlinesonink": {
    resourceKey: "m736974652e6272616e6473797374656d2e746865736f6c6172696e737472756d656e74637265616d6c696e65736f6e696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thesolarinstrumentinklinesoncream": {
    resourceKey: "m736974652e6272616e6473797374656d2e746865736f6c6172696e737472756d656e74696e6b6c696e65736f6e637265616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thesolarinstrumentisachartof": {
    resourceKey: "m736974652e6272616e6473797374656d2e746865736f6c6172696e737472756d656e7469736163686172746f66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thesolstoneapptakesinwhatyou": {
    resourceKey: "m736974652e6272616e6473797374656d2e746865736f6c73746f6e6561707074616b6573696e77686174796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thesolstonebrandsystemthenumbersthe": {
    resourceKey: "m736974652e6272616e6473797374656d2e746865736f6c73746f6e656272616e6473797374656d7468656e756d62657273746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.thesystemisbuiltfromsevenradii": {
    resourceKey: "m736974652e6272616e6473797374656d2e74686573797374656d69736275696c7466726f6d736576656e7261646969",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.theword": {
    resourceKey: "m736974652e6272616e6473797374656d2e746865776f7264",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.tilecreamfcf3e4surfacecreamfefcf8whiteffffffink1a1a1a": {
    resourceKey: "m736974652e6272616e6473797374656d2e74696c65637265616d66636633653473757266616365637265616d6665666366387768697465666666666666696e6b316131613161",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.tones": {
    resourceKey: "m736974652e6272616e6473797374656d2e746f6e6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.twotypefacescomfortaafordisplayandinter": {
    resourceKey: "m736974652e6272616e6473797374656d2e74776f747970656661636573636f6d666f72746161666f72646973706c6179616e64696e746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.type": {
    resourceKey: "m736974652e6272616e6473797374656d2e74797065",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.updatednovember15": {
    resourceKey: "m736974652e6272616e6473797374656d2e757064617465646e6f76656d6265723135",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.use": {
    resourceKey: "m736974652e6272616e6473797374656d2e757365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.useitlightwithinklineson": {
    resourceKey: "m736974652e6272616e6473797374656d2e75736569746c6967687477697468696e6b6c696e65736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.usingthis": {
    resourceKey: "m736974652e6272616e6473797374656d2e7573696e6774686973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.whatanobjectorapageis": {
    resourceKey: "m736974652e6272616e6473797374656d2e77686174616e6f626a6563746f7261706167656973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.whatgoesintoyourjournal": {
    resourceKey: "m736974652e6272616e6473797374656d2e77686174676f6573696e746f796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.brandsystem.yourjournalisalwaysprivateonlyyours": {
    resourceKey: "m736974652e6272616e6473797374656d2e796f75726a6f75726e616c6973616c77617973707269766174656f6e6c79796f757273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.download": {
    resourceKey: "m736974652e6368726f6d652e646f776e6c6f6164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.earlydaysonamaconwindows": {
    resourceKey: "m736974652e6368726f6d652e6561726c79646179736f6e616d61636f6e77696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.footer": {
    resourceKey: "m736974652e6368726f6d652e666f6f746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.getstarted": {
    resourceKey: "m736974652e6368726f6d652e67657473746172746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.integrate": {
    resourceKey: "m736974652e6368726f6d652e696e74656772617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.main": {
    resourceKey: "m736974652e6368726f6d652e6d61696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.menu": {
    resourceKey: "m736974652e6368726f6d652e6d656e75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.more": {
    resourceKey: "m736974652e6368726f6d652e6d6f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.n2026solpbcyourjournalisalways": {
    resourceKey: "m736974652e6368726f6d652e6e32303236736f6c706263796f75726a6f75726e616c6973616c77617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.n2026solpbcyourjournalisalways2": {
    resourceKey: "m736974652e6368726f6d652e6e32303236736f6c706263796f75726a6f75726e616c6973616c7761797332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.onyourwifiorvpn": {
    resourceKey: "m736974652e6368726f6d652e6f6e796f7572776966696f7276706e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.opensource": {
    resourceKey: "m736974652e6368726f6d652e6f70656e736f75726365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.phone": {
    resourceKey: "m736974652e6368726f6d652e70686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.privacy": {
    resourceKey: "m736974652e6368726f6d652e70726976616379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.releases": {
    resourceKey: "m736974652e6368726f6d652e72656c6561736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.services": {
    resourceKey: "m736974652e6368726f6d652e7365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.setupsteps": {
    resourceKey: "m736974652e6368726f6d652e73657475707374657073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.signedbysolpbcnotarizedbyapple": {
    resourceKey: "m736974652e6368726f6d652e7369676e65646279736f6c7062636e6f746172697a656462796170706c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.skiptocontent": {
    resourceKey: "m736974652e6368726f6d652e736b6970746f636f6e74656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.solstonehome": {
    resourceKey: "m736974652e6368726f6d652e736f6c73746f6e65686f6d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.sourcecodeongithub": {
    resourceKey: "m736974652e6368726f6d652e736f75726365636f64656f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.support": {
    resourceKey: "m736974652e6368726f6d652e737570706f7274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.thisdownloadisforacomputeron": {
    resourceKey: "m736974652e6368726f6d652e74686973646f776e6c6f61646973666f7261636f6d70757465726f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.trust": {
    resourceKey: "m736974652e6368726f6d652e7472757374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.chrome.whatsnewinthisversion": {
    resourceKey: "m736974652e6368726f6d652e77686174736e6577696e7468697376657273696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.alreadyheld": {
    resourceKey: "m736974652e637573746f647962726f777365722e616c726561647968656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.answeredalreadyheld": {
    resourceKey: "m736974652e637573746f647962726f777365722e616e737765726564616c726561647968656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.answeredreceivednotwritten": {
    resourceKey: "m736974652e637573746f647962726f777365722e616e73776572656472656365697665646e6f747772697474656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.answeredwritten": {
    resourceKey: "m736974652e637573746f647962726f777365722e616e7377657265647772697474656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.audio1405to1410": {
    resourceKey: "m736974652e637573746f647962726f777365722e617564696f31343035746f31343130",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.checking": {
    resourceKey: "m736974652e637573746f647962726f777365722e636865636b696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.eachfilegoestoyourjournalwith": {
    resourceKey: "m736974652e637573746f647962726f777365722e6561636866696c65676f6573746f796f75726a6f75726e616c77697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.fiveminutesaretakeninandwait": {
    resourceKey: "m736974652e637573746f647962726f777365722e666976656d696e7574657361726574616b656e696e616e6477616974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.held": {
    resourceKey: "m736974652e637573746f647962726f777365722e68656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.keptgoesagainlater": {
    resourceKey: "m736974652e637573746f647962726f777365722e6b657074676f6573616761696e6c61746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.noanswerkept": {
    resourceKey: "m736974652e637573746f647962726f777365722e6e6f616e737765726b657074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.nothingyet": {
    resourceKey: "m736974652e637573746f647962726f777365722e6e6f7468696e67796574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.onitswaystillhere": {
    resourceKey: "m736974652e637573746f647962726f777365722e6f6e6974737761797374696c6c68657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.onthisphone": {
    resourceKey: "m736974652e637573746f647962726f777365722e6f6e7468697370686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.receivednotwritten": {
    resourceKey: "m736974652e637573746f647962726f777365722e72656365697665646e6f747772697474656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.removedfromthephone": {
    resourceKey: "m736974652e637573746f647962726f777365722e72656d6f76656466726f6d74686570686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.screen1405to1410": {
    resourceKey: "m736974652e637573746f647962726f777365722e73637265656e31343035746f31343130",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.thephonechecksitsowncopiesagain": {
    resourceKey: "m736974652e637573746f647962726f777365722e74686570686f6e65636865636b736974736f776e636f70696573616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.whereyouwere1405to14": {
    resourceKey: "m736974652e637573746f647962726f777365722e7768657265796f757765726531343035746f3134",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.withnoanswernothingisremovedeverything": {
    resourceKey: "m736974652e637573746f647962726f777365722e776974686e6f616e737765726e6f7468696e67697372656d6f76656465766572797468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.written": {
    resourceKey: "m736974652e637573746f647962726f777365722e7772697474656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.custodybrowser.yourjournalreportsoneveryfileit": {
    resourceKey: "m736974652e637573746f647962726f777365722e796f75726a6f75726e616c7265706f7274736f6e657665727966696c656974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundplayground.afternoon": {
    resourceKey: "m736974652e64617967726f756e64706c617967726f756e642e61667465726e6f6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundplayground.night": {
    resourceKey: "m736974652e64617967726f756e64706c617967726f756e642e6e69676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundplayground.rightnowbyyourclockclocktextm": {
    resourceKey: "m736974652e64617967726f756e64706c617967726f756e642e72696768746e6f776279796f7572636c6f636b636c6f636b746578746d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundplayground.rightnowbyyourclockclocktextmxd97d5693": {
    resourceKey: "m736974652e64617967726f756e64706c617967726f756e642e72696768746e6f776279796f7572636c6f636b636c6f636b746578746d786439376435363933",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.abandthatwouldsitonthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e6162616e6474686174776f756c647369746f6e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.abrowserorwebviewthelong": {
    resourceKey: "m736974652e64617967726f756e64737065632e6162726f777365726f72776562766965777468656c6f6e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.abrowserunderprefersreducedmotionthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e6162726f77736572756e64657270726566657273726564756365646d6f74696f6e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.ahiddenbrowserdocumentrunsnotimer": {
    resourceKey: "m736974652e64617967726f756e64737065632e6168696464656e62726f77736572646f63756d656e7472756e736e6f74696d6572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.androidthephoneappdoesnotdraw": {
    resourceKey: "m736974652e64617967726f756e64737065632e616e64726f696474686570686f6e65617070646f65736e6f7464726177",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.aniossheetdoesnotpausethe": {
    resourceKey: "m736974652e64617967726f756e64737065632e616e696f737368656574646f65736e6f747061757365746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.anyplatformloadmarksvgviewbox2": {
    resourceKey: "m736974652e64617967726f756e64737065632e616e79706c6174666f726d6c6f61646d61726b73766776696577626f7832",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.apositionthesurfacealreadyhasin": {
    resourceKey: "m736974652e64617967726f756e64737065632e61706f736974696f6e74686573757266616365616c7265616479686173696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.appearancedaynightduskthewindowthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e617070656172616e63656461796e696768746475736b74686577696e646f77746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.appearancetheownerssystemappearancenever": {
    resourceKey: "m736974652e64617967726f756e64737065632e617070656172616e63657468656f776e65727373797374656d617070656172616e63656e65766572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.asunsetafterlocalmidnightreykjavik21": {
    resourceKey: "m736974652e64617967726f756e64737065632e6173756e73657461667465726c6f63616c6d69646e696768747265796b6a6176696b3231",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.asurfacewhoseowngroundisanother": {
    resourceKey: "m736974652e64617967726f756e64737065632e617375726661636577686f73656f776e67726f756e646973616e6f74686572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.at0800thetopleftquarter": {
    resourceKey: "m736974652e64617967726f756e64737065632e617430383030746865746f706c65667471756172746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.atnightthelogoisntdrawn": {
    resourceKey: "m736974652e64617967726f756e64737065632e61746e696768747468656c6f676f69736e74647261776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.atranslucentpanelovertheskyis": {
    resourceKey: "m736974652e64617967726f756e64737065632e617472616e736c7563656e7470616e656c6f766572746865736b796973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.att0andt1no": {
    resourceKey: "m736974652e64617967726f756e64737065632e61747430616e6474316e6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.attthecentrematchestheworked": {
    resourceKey: "m736974652e64617967726f756e64737065632e61747474686563656e7472656d617463686573746865776f726b6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.awebviewinsideanappwindows": {
    resourceKey: "m736974652e64617967726f756e64737065632e6177656276696577696e73696465616e61707077696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.awebviewonwindowshasno": {
    resourceKey: "m736974652e64617967726f756e64737065632e61776562766965776f6e77696e646f77736861736e6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.bowdirectiontowardthetopofthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e626f77646972656374696f6e746f77617264746865746f706f66746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.bowsagittachord007919tan36": {
    resourceKey: "m736974652e64617967726f756e64737065632e626f777361676974746163686f726430303739313974616e3336",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.brightnesscurveriseholdsetsineease": {
    resourceKey: "m736974652e64617967726f756e64737065632e6272696768746e657373637572766572697365686f6c6473657473696e6565617365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.buildingsomethingforanownerfromtheir": {
    resourceKey: "m736974652e64617967726f756e64737065632e6275696c64696e67736f6d657468696e67666f72616e6f776e657266726f6d7468656972",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.cliptothesurfacenothingofthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e636c6970746f746865737572666163656e6f7468696e676f66746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.colorbeamgoldffcc33everystarboth": {
    resourceKey: "m736974652e64617967726f756e64737065632e636f6c6f726265616d676f6c64666663633333657665727973746172626f7468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.colorondarkmixgoldorange0": {
    resourceKey: "m736974652e64617967726f756e64737065632e636f6c6f726f6e6461726b6d6978676f6c646f72616e676530",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.coloronlightmixfff3cfgold0": {
    resourceKey: "m736974652e64617967726f756e64737065632e636f6c6f726f6e6c696768746d6978666666336366676f6c6430",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.coloroutsidesolstonesbrandcolorsthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e636f6c6f726f757473696465736f6c73746f6e65736272616e64636f6c6f7273746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.coloroutsidesolstonesbrandcolorsthex1cfe3ef6": {
    resourceKey: "m736974652e64617967726f756e64737065632e636f6c6f726f757473696465736f6c73746f6e65736272616e64636f6c6f7273746865783163666533656636",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.contentfollowstheownersappearanceevery": {
    resourceKey: "m736974652e64617967726f756e64737065632e636f6e74656e74666f6c6c6f77737468656f776e657273617070656172616e63656576657279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.contentneverflipseverylightgroundsits": {
    resourceKey: "m736974652e64617967726f756e64737065632e636f6e74656e746e65766572666c69707365766572796c6967687467726f756e6473697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.copythesefilesintowhatyoubuild": {
    resourceKey: "m736974652e64617967726f756e64737065632e636f7079746865736566696c6573696e746f77686174796f756275696c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.dark392e26creammixed080toward": {
    resourceKey: "m736974652e64617967726f756e64737065632e6461726b333932653236637265616d6d69786564303830746f77617264",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.dawnandduskdawnsunrise30min": {
    resourceKey: "m736974652e64617967726f756e64737065632e6461776e616e646475736b6461776e73756e7269736533306d696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.dawnduskw1envtfull": {
    resourceKey: "m736974652e64617967726f756e64737065632e6461776e6475736b7731656e767466756c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.dawnrisetwdusksettwt": {
    resourceKey: "m736974652e64617967726f756e64737065632e6461776e7269736574776475736b736574747774",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.daygroundjsdoesallofthismount": {
    resourceKey: "m736974652e64617967726f756e64737065632e64617967726f756e646a73646f6573616c6c6f66746869736d6f756e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.daygroundjshttpssolstoneappbranddayground": {
    resourceKey: "m736974652e64617967726f756e64737065632e64617967726f756e646a736874747073736f6c73746f6e656170706272616e6464617967726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.daygroundjsonhttpssolstoneappbranddayground": {
    resourceKey: "m736974652e64617967726f756e64737065632e64617967726f756e646a736f6e6874747073736f6c73746f6e656170706272616e6464617967726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.daygroundmdhttpssolstoneappbranddayground": {
    resourceKey: "m736974652e64617967726f756e64737065632e64617967726f756e646d646874747073736f6c73746f6e656170706272616e6464617967726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.denver20260919linedenver19": {
    resourceKey: "m736974652e64617967726f756e64737065632e64656e76657232303236303931396c696e6564656e7665723139",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.denver20260923linedenver23on": {
    resourceKey: "m736974652e64617967726f756e64737065632e64656e76657232303236303932336c696e6564656e76657232336f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.duskthewindowxmduskfrom": {
    resourceKey: "m736974652e64617967726f756e64737065632e6475736b74686577696e646f77786d6475736b66726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.elementtherule": {
    resourceKey: "m736974652e64617967726f756e64737065632e656c656d656e7474686572756c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.endsdawnatthetopleftcorner": {
    resourceKey: "m736974652e64617967726f756e64737065632e656e64736461776e6174746865746f706c656674636f726e6572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.everylabelonthelightnightclears": {
    resourceKey: "m736974652e64617967726f756e64737065632e65766572796c6162656c6f6e7468656c696768746e69676874636c65617273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.everynumberandeveryformulainthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e65766572796e756d626572616e646576657279666f726d756c61696e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.everythingsolarstaysonthewholeminute": {
    resourceKey: "m736974652e64617967726f756e64737065632e65766572797468696e67736f6c617273746179736f6e74686577686f6c656d696e757465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.flooropacity0": {
    resourceKey: "m736974652e64617967726f756e64737065632e666c6f6f726f70616369747930",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.fromdusktodawntheskycomes": {
    resourceKey: "m736974652e64617967726f756e64737065632e66726f6d6475736b746f6461776e746865736b79636f6d6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.glowgradientradialalphaaat0": {
    resourceKey: "m736974652e64617967726f756e64737065632e676c6f776772616469656e7472616469616c616c70686161617430",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.groundcrossfadedaynightlinearover": {
    resourceKey: "m736974652e64617967726f756e64737065632e67726f756e6463726f7373666164656461796e696768746c696e6561726f766572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.groundslightdayfefcf8nightaea393true": {
    resourceKey: "m736974652e64617967726f756e64737065632e67726f756e64736c696768746461796665666366386e6967687461656133393374727565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.halobydaypeakalpha022": {
    resourceKey: "m736974652e64617967726f756e64737065632e68616c6f62796461797065616b616c706861303232",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.halocolorgoldffcc33": {
    resourceKey: "m736974652e64617967726f756e64737065632e68616c6f636f6c6f72676f6c64666663633333",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.haloradiusrrthesuns": {
    resourceKey: "m736974652e64617967726f756e64737065632e68616c6f726164697573727274686573756e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.hiddenworkstopsahiddenbrowserdocument": {
    resourceKey: "m736974652e64617967726f756e64737065632e68696464656e776f726b73746f70736168696464656e62726f77736572646f63756d656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.insidethetruedarkwindownoglow": {
    resourceKey: "m736974652e64617967726f756e64737065632e696e73696465746865747275656461726b77696e646f776e6f676c6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.insidethewindoww0": {
    resourceKey: "m736974652e64617967726f756e64737065632e696e7369646574686577696e646f777730",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.inthelongexposureatrailappears": {
    resourceKey: "m736974652e64617967726f756e64737065632e696e7468656c6f6e676578706f7375726561747261696c61707065617273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.iosipadosandwatchosswiftuiatimelineview": {
    resourceKey: "m736974652e64617967726f756e64737065632e696f73697061646f73616e6477617463686f73737769667475696174696d656c696e6576696577",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.itdoesthisinwhicheverappearancethe": {
    resourceKey: "m736974652e64617967726f756e64737065632e6974646f657374686973696e776869636865766572617070656172616e6365746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.itgoesoutinsidethetruedark": {
    resourceKey: "m736974652e64617967726f756e64737065632e6974676f65736f7574696e73696465746865747275656461726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.legibilityisfixedinthecontainerand": {
    resourceKey: "m736974652e64617967726f756e64737065632e6c65676962696c69747969736669786564696e746865636f6e7461696e6572616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.letmbelocalminutessincemidnight": {
    resourceKey: "m736974652e64617967726f756e64737065632e6c65746d62656c6f63616c6d696e7574657373696e63656d69646e69676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.levelsradii1751381": {
    resourceKey: "m736974652e64617967726f756e64737065632e6c6576656c73726164696931373531333831",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.lightsurfacecreamfefcf8aea393creammixed": {
    resourceKey: "m736974652e64617967726f756e64737065632e6c6967687473757266616365637265616d666566636638616561333933637265616d6d69786564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.macthesameswiftrendererasthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e6d616374686573616d65737769667472656e64657265726173746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.marksvghttpssolstoneappbrandassets": {
    resourceKey: "m736974652e64617967726f756e64737065632e6d61726b7376676874747073736f6c73746f6e656170706272616e64617373657473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.motionfollows10aoneverysurfaceno": {
    resourceKey: "m736974652e64617967726f756e64737065632e6d6f74696f6e666f6c6c6f77733130616f6e6576657279737572666163656e6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.motiontheminutetickwithoneexception": {
    resourceKey: "m736974652e64617967726f756e64737065632e6d6f74696f6e7468656d696e7574657469636b776974686f6e65657863657074696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n0630and1930onlyif": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e30363330616e64313933306f6e6c796966",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n10abysurface": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e313061627973757266616365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n10motionpowerandvisibility": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e31306d6f74696f6e706f776572616e647669736962696c697479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n11platformnotes": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e3131706c6174666f726d6e6f746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n12acceptancewhattocheckona": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e3132616363657074616e636577686174746f636865636b6f6e61",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n1theidea": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e3174686569646561",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n2thevalues": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e3274686576616c756573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n3geometrywherethelogogoes": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e3367656f6d6574727977686572657468656c6f676f676f6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n4athetwilightweightandtruedark": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e34617468657477696c69676874776569676874616e64747275656461726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n4timethedaysparameter": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e3474696d6574686564617973706172616d65746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n5sunriseandsunsetonthedevice": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e3573756e72697365616e6473756e7365746f6e746865646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n6thegrounds": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e3674686567726f756e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n7theglow": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e37746865676c6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n8thenightsky": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e387468656e69676874736b79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n9athelogoonadarkground": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e39617468656c6f676f6f6e616461726b67726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n9btextoverthelightnight": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e3962746578746f7665727468656c696768746e69676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.n9contentontop": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e39636f6e74656e746f6e746f70",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.night0day1night1before": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e6967687430646179316e69676874316265666f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.nighttruedarkthegroundatnight": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e69676874747275656461726b74686567726f756e6461746e69676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.nonetworkcallandnolocationrequest": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e6f6e6574776f726b63616c6c616e646e6f6c6f636174696f6e72657175657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.nothingreactstothedaygroundnoshadows": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e6f7468696e67726561637473746f74686564617967726f756e646e6f736861646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.notsurejustasktheresa": {
    resourceKey: "m736974652e64617967726f756e64737065632e6e6f74737572656a75737461736b74686572657361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.oneextendedminuteaxisaboveabout64": {
    resourceKey: "m736974652e64617967726f756e64737065632e6f6e65657874656e6465646d696e7574656178697361626f766561626f75743634",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.onelayeronepathonegradientthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e6f6e656c617965726f6e65706174686f6e656772616469656e74746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.onelogopersurfacetextincontainers": {
    resourceKey: "m736974652e64617967726f756e64737065632e6f6e656c6f676f7065727375726661636574657874696e636f6e7461696e657273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.oneslotof36keepsthemidday": {
    resourceKey: "m736974652e64617967726f756e64737065632e6f6e65736c6f746f6633366b656570737468656d6964646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.onlightgroundspinholesthesamegold": {
    resourceKey: "m736974652e64617967726f756e64737065632e6f6e6c6967687467726f756e647370696e686f6c657374686573616d65676f6c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.onsurfacecreamat055the": {
    resourceKey: "m736974652e64617967726f756e64737065632e6f6e73757266616365637265616d6174303535746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.opacity055attheplateauon": {
    resourceKey: "m736974652e64617967726f756e64737065632e6f7061636974793035356174746865706c61746561756f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.orderthegroundthenthetwilightglow": {
    resourceKey: "m736974652e64617967726f756e64737065632e6f7264657274686567726f756e647468656e7468657477696c69676874676c6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.overthecorner10rat": {
    resourceKey: "m736974652e64617967726f756e64737065632e6f766572746865636f726e65723130726174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.parametervaluewhy": {
    resourceKey: "m736974652e64617967726f756e64737065632e706172616d6574657276616c7565776879",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.peakopacity055onalight": {
    resourceKey: "m736974652e64617967726f756e64737065632e7065616b6f7061636974793035356f6e616c69676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.positionattimet01a": {
    resourceKey: "m736974652e64617967726f756e64737065632e706f736974696f6e617474696d6574303161",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.reducemotionhassomethingtoreducethe": {
    resourceKey: "m736974652e64617967726f756e64737065632e7265647563656d6f74696f6e686173736f6d657468696e67746f726564756365746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.samplepositionsonthephonelinepath": {
    resourceKey: "m736974652e64617967726f756e64737065632e73616d706c65706f736974696f6e736f6e74686570686f6e656c696e6570617468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.sizesider2risthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e73697a65736964657232726973746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.solarmidnightisthemidpointofdusk": {
    resourceKey: "m736974652e64617967726f756e64737065632e736f6c61726d69646e6967687469737468656d6964706f696e746f666475736b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.solstonesappsonappledevicesat": {
    resourceKey: "m736974652e64617967726f756e64737065632e736f6c73746f6e6573617070736f6e6170706c65646576696365736174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.sunriseandsunsetcomefromalatitude": {
    resourceKey: "m736974652e64617967726f756e64737065632e73756e72697365616e6473756e736574636f6d6566726f6d616c61746974756465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.sunriseandsunsetfromthesystemtimezone": {
    resourceKey: "m736974652e64617967726f756e64737065632e73756e72697365616e6473756e73657466726f6d74686573797374656d74696d657a6f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.surfacetheshowersstreakstheaurora": {
    resourceKey: "m736974652e64617967726f756e64737065632e7375726661636574686573686f7765727373747265616b737468656175726f7261",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.terminalsnoskyglowonly11none": {
    resourceKey: "m736974652e64617967726f756e64737065632e7465726d696e616c736e6f736b79676c6f776f6e6c7931316e6f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.terminalsthesamefunctionbutaterminal": {
    resourceKey: "m736974652e64617967726f756e64737065632e7465726d696e616c7374686573616d6566756e6374696f6e627574617465726d696e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.textneversitsdirectlyonthelogo": {
    resourceKey: "m736974652e64617967726f756e64737065632e746578746e65766572736974736469726563746c796f6e7468656c6f676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theandroidwatchthelongexposurewhile": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865616e64726f696477617463687468656c6f6e676578706f737572657768696c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theappearanceequalsthesystemsat": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865617070656172616e6365657175616c7374686573797374656d736174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theappiconalockupinthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686561707069636f6e616c6f636b7570696e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theapplewatchalwaysdrawsthedayground": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656170706c657761746368616c77617973647261777374686564617967726f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theapplewatchthedaygroundisthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656170706c65776174636874686564617967726f756e646973746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theapplewatchwristdownthelong": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656170706c6577617463687772697374646f776e7468656c6f6e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thearcacirculararcsubtending36": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656172636163697263756c617261726373756274656e64696e673336",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thearcsubtends36001": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686561726373756274656e64733336303031",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theauroraonlyinsidetruedarkeasing": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656175726f72616f6e6c79696e73696465747275656461726b656173696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thebows007919cthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865626f777330303739313963746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thebrightnesscurveenvtrisehold": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656272696768746e6573736375727665656e767472697365686f6c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thechordcabunitdirectionu": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686563686f7264636162756e6974646972656374696f6e75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thecirclerarcc8ss2": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865636972636c65726172636338737332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thecoordinatescomefromthefirstof": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865636f6f7264696e61746573636f6d6566726f6d74686566697273746f66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thecrossfadedaynightlinearacross": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686563726f7373666164656461796e696768746c696e6561726163726f7373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thedaygroundcropsandfadesthelogo": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686564617967726f756e6463726f7073616e6466616465737468656c6f676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thedaygroundisabackgroundeverythingthat": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686564617967726f756e646973616261636b67726f756e6465766572797468696e6774686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thedaygroundisforappsthatshow": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686564617967726f756e646973666f72617070737468617473686f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thedaygroundneverasksforalocation": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686564617967726f756e646e6576657261736b73666f72616c6f636174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thedayhalogoldradiusrcentred": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686564617968616c6f676f6c647261646975737263656e74726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theendsthedawnendais": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865656e64737468656461776e656e64616973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thefieldthedaysroadone": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656669656c6474686564617973726f61646f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theglowisagroundeffectit": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865676c6f7769736167726f756e646566666563746974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thegroundsmatch6stableat": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686567726f756e64736d6174636836737461626c656174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thehiddensunsparametertet": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686568696464656e73756e73706172616d65746572746574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thelightnightgoesdownto8c806e": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656c696768746e69676874676f6573646f776e746f386338303665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thelighttruedarkisthedeepest": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656c69676874747275656461726b697374686564656570657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thelogoasdrawngoldffcc33beams": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656c6f676f6173647261776e676f6c646666636333336265616d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thelogoisdrawnwhile002": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656c6f676f6973647261776e7768696c65303032",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thelogomovesabout2pxa": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656c6f676f6d6f76657361626f757432707861",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thelongexposurewherestreaksdont": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656c6f6e676578706f73757265776865726573747265616b73646f6e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thenightiscachednotredrawneach": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656e6967687469736361636865646e6f747265647261776e65616368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thenightskyatsolarmidnighton": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656e69676874736b796174736f6c61726d69646e696768746f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thenightskythedaysroad": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656e69676874736b7974686564617973726f6164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theownersappearancepickstherow": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468656f776e657273617070656172616e63657069636b73746865726f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theplaygroundonthispageplaysa": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865706c617967726f756e646f6e7468697370616765706c61797361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thepositionupdatesatmostoncea": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865706f736974696f6e7570646174657361746d6f73746f6e636561",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thereferenceisnightskyandnightskymathin": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468657265666572656e636569736e69676874736b79616e646e69676874736b796d617468696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thereisnohandsetsunriseor": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865726569736e6f68616e6473657473756e726973656f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thesameunderreducemotionorlow": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686573616d65756e6465727265647563656d6f74696f6e6f726c6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theshower11meteorsinthe10": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686573686f77657231316d6574656f7273696e7468653130",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.theskyturnsfieldstreamandtips": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865736b797475726e736669656c6473747265616d616e6474697073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thesolstonelogoisasunand": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865736f6c73746f6e656c6f676f69736173756e616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thesolstonelogoisasunbehind": {
    resourceKey: "m736974652e64617967726f756e64737065632e746865736f6c73746f6e656c6f676f69736173756e626568696e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thesunssizetheshorterside": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686573756e7373697a6574686573686f7274657273696465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thesystemtimezonesreferencepointtzdb": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686573797374656d74696d657a6f6e65737265666572656e6365706f696e74747a6462",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thetentipstenstarsatthe": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686574656e7469707374656e73746172736174746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thetwilightglowradiusralpha0": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468657477696c69676874676c6f7772616469757372616c70686130",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thetwilightglowradiusrcentredon": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468657477696c69676874676c6f777261646975737263656e747265646f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thetwilightglowsradiusisline": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468657477696c69676874676c6f777372616469757369736c696e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thetwilightglowsradiusisr": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468657477696c69676874676c6f7773726164697573697372",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thetwilightweightw01says": {
    resourceKey: "m736974652e64617967726f756e64737065632e7468657477696c6967687477656967687477303173617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.thewindowdawnxdawnmdawn": {
    resourceKey: "m736974652e64617967726f756e64737065632e74686577696e646f776461776e786461776e6d6461776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.truedark180mincentredonsolar": {
    resourceKey: "m736974652e64617967726f756e64737065632e747275656461726b3138306d696e63656e747265646f6e736f6c6172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.twilight30mineithersideofsunrise": {
    resourceKey: "m736974652e64617967726f756e64737065632e7477696c6967687433306d696e656974686572736964656f6673756e72697365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.tworadialgradientsbothwiththestops": {
    resourceKey: "m736974652e64617967726f756e64737065632e74776f72616469616c6772616469656e7473626f74687769746874686573746f7073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.warmthtowardthehorizonnonethelogo": {
    resourceKey: "m736974652e64617967726f756e64737065632e7761726d7468746f77617264746865686f72697a6f6e6e6f6e657468656c6f676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.webalayercoveringtheviewportfixed": {
    resourceKey: "m736974652e64617967726f756e64737065632e776562616c61796572636f766572696e6774686576696577706f72746669786564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.whatitcostsandwhatisnt": {
    resourceKey: "m736974652e64617967726f756e64737065632e776861746974636f737473616e647768617469736e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.whenstarvisibilityissnight1": {
    resourceKey: "m736974652e64617967726f756e64737065632e7768656e737461727669736962696c6974796973736e6967687431",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.whereaplatformputsalabelstraight": {
    resourceKey: "m736974652e64617967726f756e64737065632e776865726561706c6174666f726d70757473616c6162656c7374726169676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.whereasurfacedrawsthedarkrow": {
    resourceKey: "m736974652e64617967726f756e64737065632e7768657265617375726661636564726177737468656461726b726f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.whyatduskanddawnthecentre": {
    resourceKey: "m736974652e64617967726f756e64737065632e77687961746475736b616e646461776e74686563656e747265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.widgetscardssheetsandbarskeeptheir": {
    resourceKey: "m736974652e64617967726f756e64737065632e776964676574736361726473736865657473616e64626172736b6565707468656972",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.withnopositioninhandthetimes": {
    resourceKey: "m736974652e64617967726f756e64737065632e776974686e6f706f736974696f6e696e68616e6474686574696d6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.workednumbers": {
    resourceKey: "m736974652e64617967726f756e64737065632e776f726b65646e756d62657273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundspec.workinthesurfacesownpixels": {
    resourceKey: "m736974652e64617967726f756e64737065632e776f726b696e74686573757266616365736f776e706978656c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundtables.clockgroundlightdarklogoopacitylight": {
    resourceKey: "m736974652e64617967726f756e647461626c65732e636c6f636b67726f756e646c696768746461726b6c6f676f6f7061636974796c69676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundtables.clocktnightenv": {
    resourceKey: "m736974652e64617967726f756e647461626c65732e636c6f636b746e69676874656e76",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundtables.dawnanddusk": {
    resourceKey: "m736974652e64617967726f756e647461626c65732e6461776e616e646475736b",
    formatIntent: "text",
    arguments: [
      { name: "rise", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "set", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "dawn", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "dusk", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.daygroundtables.framewhsidelogora": {
    resourceKey: "m736974652e64617967726f756e647461626c65732e6672616d657768736964656c6f676f7261",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.daygroundtables.solarmidnight": {
    resourceKey: "m736974652e64617967726f756e647461626c65732e736f6c61726d69646e69676874",
    formatIntent: "text",
    arguments: [
      { name: "rise", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "set", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "midnight", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.download.applesiliconm1ornewermacos15": {
    resourceKey: "m736974652e646f776e6c6f61642e6170706c6573696c69636f6e6d316f726e657765726d61636f733135",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.download.arm64windows11": {
    resourceKey: "m736974652e646f776e6c6f61642e61726d363477696e646f77733131",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.download.checkitsourstrustsolstoneapp": {
    resourceKey: "m736974652e646f776e6c6f61642e636865636b6974736f7572737472757374736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.download.linuxappguide": {
    resourceKey: "m736974652e646f776e6c6f61642e6c696e75786170706775696465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.download.onyourphoneortabletsolstoneon": {
    resourceKey: "m736974652e646f776e6c6f61642e6f6e796f757270686f6e656f727461626c6574736f6c73746f6e656f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.download.signedbysolpbcminisignandopenpgp": {
    resourceKey: "m736974652e646f776e6c6f61642e7369676e65646279736f6c7062636d696e697369676e616e646f70656e706770",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.download.signedbysolpbcminisignandopenpgpx26b6f31f": {
    resourceKey: "m736974652e646f776e6c6f61642e7369676e65646279736f6c7062636d696e697369676e616e646f70656e706770783236623666333166",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.download.takesinwhatyoushare": {
    resourceKey: "m736974652e646f776e6c6f61642e74616b6573696e77686174796f757368617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.download.x64notyettestedonarm64": {
    resourceKey: "m736974652e646f776e6c6f61642e7836346e6f747965747465737465646f6e61726d3634",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.androidwillaskwhethertheappyou": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e616e64726f696477696c6c61736b77686574686572746865617070796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.apermissiononlythisappcanholdapp": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e617065726d697373696f6e6f6e6c797468697361707063616e686f6c64617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.approximatelocationaccesscoarselocation": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e617070726f78696d6174656c6f636174696f6e616363657373636f617273656c6f636174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.appscanrecommendedplayprotecthasntseen": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e6170707363616e7265636f6d6d656e646564706c617970726f746563746861736e747365656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.areminderafterarestartreceivebootcompleted": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e6172656d696e6465726166746572617265737461727472656365697665626f6f74636f6d706c65746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.calendarreadcalendar": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e63616c656e6461727265616463616c656e646172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.cameracamera": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e63616d65726163616d657261",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.checkthefileisours": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e636865636b74686566696c6569736f757273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.connectyourcomputerandwatchtothe": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e636f6e6e656374796f7572636f6d7075746572616e647761746368746f746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.downloadthesolstoneappforwearos": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e646f776e6c6f6164746865736f6c73746f6e65617070666f72776561726f73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.downloadthewatchapkonyourcomputer": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e646f776e6c6f6164746865776174636861706b6f6e796f7572636f6d7075746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.installingthisdirectcopyonyourwatch": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e696e7374616c6c696e6774686973646972656374636f70796f6e796f75727761746368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.installitonyourwatch": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e696e7374616c6c69746f6e796f75727761746368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.internetnetworkstateinternetaccessnetworkstate": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e696e7465726e65746e6574776f726b7374617465696e7465726e65746163636573736e6574776f726b7374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.keepthenoticevisiblepostpromotednotifications": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e6b6565707468656e6f7469636576697369626c65706f737470726f6d6f7465646e6f74696669636174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.keepthephoneawakewakelock": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e6b65657074686570686f6e656177616b6577616b656c6f636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.microphonerecordaudio": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e6d6963726f70686f6e657265636f7264617564696f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.notificationspostnotifications": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e6e6f74696669636174696f6e73706f73746e6f74696669636174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.onamacshasuma256c": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e6f6e616d616373686173756d6132353663",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.ongoingworkforegroundservicemicrophonelocationcamerame": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e6f6e676f696e67776f726b666f726567726f756e64736572766963656d6963726f70686f6e656c6f636174696f6e63616d6572616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.runadbswatchaddressportinstall": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e72756e61646273776174636861646472657373706f7274696e7374616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.sendlargeimportsrunuserinitiatedjobs": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e73656e646c61726765696d706f72747372756e75736572696e697469617465646a6f6273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.thentheinstallerasksoncemoreinstall": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e7468656e746865696e7374616c6c657261736b736f6e63656d6f7265696e7374616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.thesolstoneappforwearosneeds": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e746865736f6c73746f6e65617070666f72776561726f736e65656473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.turnwirelessdebuggingandadbdebuggingback": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e7475726e776972656c657373646562756767696e67616e64616462646562756767696e676261636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.watchreleasenotes": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e776174636872656c656173656e6f746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.wearoswatch": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e776561726f737761746368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadandroid.yourbrowserwillwarnyouaboutthe": {
    resourceKey: "m736974652e646f776e6c6f6164616e64726f69642e796f757262726f7773657277696c6c7761726e796f7561626f7574746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadjournalwindows.downloadforarm64": {
    resourceKey: "m736974652e646f776e6c6f61646a6f75726e616c77696e646f77732e646f776e6c6f6164666f7261726d3634",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadjournalwindows.downloadforx64": {
    resourceKey: "m736974652e646f776e6c6f61646a6f75726e616c77696e646f77732e646f776e6c6f6164666f72783634",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadmac.applesiliconm1ornewer": {
    resourceKey: "m736974652e646f776e6c6f61646d61632e6170706c6573696c69636f6e6d316f726e65776572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadmac.macos15orlater": {
    resourceKey: "m736974652e646f776e6c6f61646d61632e6d61636f7331356f726c61746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadmac.opensourcereadthecodeongithubthe": {
    resourceKey: "m736974652e646f776e6c6f61646d61632e6f70656e736f7572636572656164746865636f64656f6e676974687562746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.downloadmac.updatesontheirowneachappupdatesitself": {
    resourceKey: "m736974652e646f776e6c6f61646d61632e757064617465736f6e74686569726f776e6561636861707075706461746573697473656c66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.acalleachlinewithwhosaid": {
    resourceKey: "m736974652e66656174757265732e6163616c6c656163686c696e657769746877686f73616964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.acallwitheachlineattributed": {
    resourceKey: "m736974652e66656174757265732e6163616c6c77697468656163686c696e6561747472696275746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.aconnectedagentcansuggestacorrection": {
    resourceKey: "m736974652e66656174757265732e61636f6e6e65637465646167656e7463616e7375676765737461636f7272656374696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.adayontheroadplaceby": {
    resourceKey: "m736974652e66656174757265732e616461796f6e746865726f6164706c6163656279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.adaysplacesonthejournal": {
    resourceKey: "m736974652e66656174757265732e6164617973706c616365736f6e7468656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.adirectorylistingofonedayin": {
    resourceKey: "m736974652e66656174757265732e616469726563746f72796c697374696e676f666f6e65646179696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.afolderofdateddirectoriesmostlyplain": {
    resourceKey: "m736974652e66656174757265732e61666f6c6465726f6664617465646469726563746f726965736d6f73746c79706c61696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.afolderofdateddirectoriesmostlyplainx0ef519c1": {
    resourceKey: "m736974652e66656174757265732e61666f6c6465726f6664617465646469726563746f726965736d6f73746c79706c61696e783065663531396331",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.afteracorrectionthesummaryrewrittenand": {
    resourceKey: "m736974652e66656174757265732e616674657261636f7272656374696f6e74686573756d6d61727972657772697474656e616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.afteryourandroidphonerestartsthesolstone": {
    resourceKey: "m736974652e66656174757265732e6166746572796f7572616e64726f696470686f6e657265737461727473746865736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.agents": {
    resourceKey: "m736974652e66656174757265732e6167656e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.agentscanstorenewmemoriesinyour": {
    resourceKey: "m736974652e66656174757265732e6167656e747363616e73746f72656e65776d656d6f72696573696e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.agentscanstorenewmemoriesinyourx75123146": {
    resourceKey: "m736974652e66656174757265732e6167656e747363616e73746f72656e65776d656d6f72696573696e796f7572783735313233313436",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.agentscansuggestandyoudecide": {
    resourceKey: "m736974652e66656174757265732e6167656e747363616e73756767657374616e64796f75646563696465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.ajournalonthesamecomputeris": {
    resourceKey: "m736974652e66656174757265732e616a6f75726e616c6f6e74686573616d65636f6d70757465726973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.all": {
    resourceKey: "m736974652e66656174757265732e616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.alocalmodelonyourowncomputer": {
    resourceKey: "m736974652e66656174757265732e616c6f63616c6d6f64656c6f6e796f75726f776e636f6d7075746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.alocalmodelonyourowncomputerx75dfb35e": {
    resourceKey: "m736974652e66656174757265732e616c6f63616c6d6f64656c6f6e796f75726f776e636f6d7075746572783735646662333565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.alwaysencryptedintransit": {
    resourceKey: "m736974652e66656174757265732e616c77617973656e63727970746564696e7472616e736974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.alwaysencryptedintransitwhatadevice": {
    resourceKey: "m736974652e66656174757265732e616c77617973656e63727970746564696e7472616e7369747768617461646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.amapofyourdaysthatnever": {
    resourceKey: "m736974652e66656174757265732e616d61706f66796f757264617973746861746e65766572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.ameetingssummaryrewrittenaftera": {
    resourceKey: "m736974652e66656174757265732e616d656574696e677373756d6d61727972657772697474656e616674657261",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.ameetingtranscripteachlinewithwho": {
    resourceKey: "m736974652e66656174757265732e616d656574696e677472616e736372697074656163686c696e657769746877686f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.amisheardnamecanstillfindthe": {
    resourceKey: "m736974652e66656174757265732e616d697368656172646e616d6563616e7374696c6c66696e64746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.anagentsmemoriesinthejournal": {
    resourceKey: "m736974652e66656174757265732e616e6167656e74736d656d6f72696573696e7468656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.andtwomore": {
    resourceKey: "m736974652e66656174757265732e616e6474776f6d6f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.aneveningsobsidiannotesasyour": {
    resourceKey: "m736974652e66656174757265732e616e6576656e696e67736f6273696469616e6e6f7465736173796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.anexportisanordinaryzipanother": {
    resourceKey: "m736974652e66656174757265732e616e6578706f72746973616e6f7264696e6172797a6970616e6f74686572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.annespageinthedemojournal": {
    resourceKey: "m736974652e66656174757265732e616e6e657370616765696e74686564656d6f6a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.anydevice": {
    resourceKey: "m736974652e66656174757265732e616e79646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.apersonspageinthejournal": {
    resourceKey: "m736974652e66656174757265732e61706572736f6e7370616765696e7468656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.apictureattheminuteitwas": {
    resourceKey: "m736974652e66656174757265732e617069637475726561747468656d696e7574656974776173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.apictureinthejournalwithits": {
    resourceKey: "m736974652e66656174757265732e6170696374757265696e7468656a6f75726e616c77697468697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.applehealthouraandstravashownas": {
    resourceKey: "m736974652e66656174757265732e6170706c656865616c74686f757261616e6473747261766173686f776e6173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.arecordingstaysonyourwristuntil": {
    resourceKey: "m736974652e66656174757265732e617265636f7264696e6773746179736f6e796f75727772697374756e74696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.asearchforromeo272matchesacross": {
    resourceKey: "m736974652e66656174757265732e61736561726368666f72726f6d656f3237326d6174636865736163726f7373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.atranscriptlinewithapossiblename": {
    resourceKey: "m736974652e66656174757265732e617472616e7363726970746c696e657769746861706f737369626c656e616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.backupsencryptedbeforetheyleave": {
    resourceKey: "m736974652e66656174757265732e6261636b757073656e637279707465646265666f7265746865796c65617665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.bluetoothheadsetskeeptheirsound": {
    resourceKey: "m736974652e66656174757265732e626c7565746f6f746868656164736574736b6565707468656972736f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.bringinwhatyoualreadyhave": {
    resourceKey: "m736974652e66656174757265732e6272696e67696e77686174796f75616c726561647968617665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.browserextension": {
    resourceKey: "m736974652e66656174757265732e62726f77736572657874656e73696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.bydefaultaheadsetmicrophoneisused": {
    resourceKey: "m736974652e66656174757265732e627964656661756c7461686561647365746d6963726f70686f6e65697375736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.calendarsstartoff": {
    resourceKey: "m736974652e66656174757265732e63616c656e6461727373746172746f6666",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.chatgptclaudeandgeminiexportsevernoteaudio": {
    resourceKey: "m736974652e66656174757265732e63686174677074636c61756465616e6467656d696e696578706f727473657665726e6f7465617564696f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.checkingandleaving": {
    resourceKey: "m736974652e66656174757265732e636865636b696e67616e646c656176696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.choosewhichappsarekeptout": {
    resourceKey: "m736974652e66656174757265732e63686f6f73657768696368617070736172656b6570746f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.choosewhichkindsofmaterialeachagent": {
    resourceKey: "m736974652e66656174757265732e63686f6f736577686963686b696e64736f666d6174657269616c656163686167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.choosewhichsitesandappsarekept": {
    resourceKey: "m736974652e66656174757265732e63686f6f736577686963687369746573616e64617070736172656b657074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.choosewhichwebsitesarekeptout": {
    resourceKey: "m736974652e66656174757265732e63686f6f7365776869636877656273697465736172656b6570746f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.chromefirefoxsafari": {
    resourceKey: "m736974652e66656174757265732e6368726f6d6566697265666f78736166617269",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.claudeclaudecodecodexandgeminicli": {
    resourceKey: "m736974652e66656174757265732e636c61756465636c61756465636f6465636f646578616e6467656d696e69636c69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.claudeconnectedandthekindsofmaterial": {
    resourceKey: "m736974652e66656174757265732e636c61756465636f6e6e6563746564616e647468656b696e64736f666d6174657269616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.claudeconnectedandwhatitmaysee": {
    resourceKey: "m736974652e66656174757265732e636c61756465636f6e6e6563746564616e647768617469746d6179736565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.claudeconnectedonthesamecomputeras": {
    resourceKey: "m736974652e66656174757265732e636c61756465636f6e6e65637465646f6e74686573616d65636f6d70757465726173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.claudeconnectedwiththekindsofmaterial": {
    resourceKey: "m736974652e66656174757265732e636c61756465636f6e6e6563746564776974687468656b696e64736f666d6174657269616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.claudesnotesfromthedemoyear": {
    resourceKey: "m736974652e66656174757265732e636c61756465736e6f74657366726f6d74686564656d6f79656172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.confidentialprocessingthatchecksbeforeitsends": {
    resourceKey: "m736974652e66656174757265732e636f6e666964656e7469616c70726f63657373696e6774686174636865636b736265666f7265697473656e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.connectgranolawithyourownpersonalapi": {
    resourceKey: "m736974652e66656174757265732e636f6e6e6563746772616e6f6c6177697468796f75726f776e706572736f6e616c617069",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.deletearecordinganimportora": {
    resourceKey: "m736974652e66656174757265732e64656c657465617265636f7264696e67616e696d706f72746f7261",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.deletingreacheswhatwasmadefromit": {
    resourceKey: "m736974652e66656174757265732e64656c6574696e6772656163686573776861747761736d61646566726f6d6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.doesitdothat": {
    resourceKey: "m736974652e66656174757265732e646f65736974646f74686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.eachagentkeepsitsmemoriesinyour": {
    resourceKey: "m736974652e66656174757265732e656163686167656e746b656570736974736d656d6f72696573696e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.eachdaygetsasummaryofwhat": {
    resourceKey: "m736974652e66656174757265732e65616368646179676574736173756d6d6172796f6677686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.eachdaygetsasummaryofwhatx9ce16718": {
    resourceKey: "m736974652e66656174757265732e65616368646179676574736173756d6d6172796f6677686174783963653136373138",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.eachmemorywithitsdeletebutton": {
    resourceKey: "m736974652e66656174757265732e656163686d656d6f72797769746869747364656c657465627574746f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.eachoneisencryptedpaddedtothe": {
    resourceKey: "m736974652e66656174757265732e656163686f6e656973656e63727970746564706164646564746f746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.eachscreenshotyoutakecomesintoyour": {
    resourceKey: "m736974652e66656174757265732e6561636873637265656e73686f74796f7574616b65636f6d6573696e746f796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.encryptednotifications": {
    resourceKey: "m736974652e66656174757265732e656e637279707465646e6f74696669636174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.everycalendarstartsoffincludingonesyou": {
    resourceKey: "m736974652e66656174757265732e657665727963616c656e6461727374617274736f6666696e636c7564696e676f6e6573796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.exportasanordinaryzip": {
    resourceKey: "m736974652e66656174757265732e6578706f72746173616e6f7264696e6172797a6970",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.fixwhospokeorwhathappenedonce": {
    resourceKey: "m736974652e66656174757265732e66697877686f73706f6b656f727768617468617070656e65646f6e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.foreachagentchoosewhatitmay": {
    resourceKey: "m736974652e66656174757265732e666f72656163686167656e7463686f6f73657768617469746d6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.howanagentreachesyourjournal": {
    resourceKey: "m736974652e66656174757265732e686f77616e6167656e7472656163686573796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.howlongoriginalmediaiskept": {
    resourceKey: "m736974652e66656174757265732e686f776c6f6e676f726967696e616c6d6564696169736b657074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.importedtranscriptskeeptheirownwordsand": {
    resourceKey: "m736974652e66656174757265732e696d706f727465647472616e736372697074736b65657074686569726f776e776f726473616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.ittakesinthewordsona": {
    resourceKey: "m736974652e66656174757265732e697474616b6573696e746865776f7264736f6e61",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.leaveoutothervoices": {
    resourceKey: "m736974652e66656174757265732e6c656176656f75746f74686572766f69636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.leaveoutothervoicesx364e33d3": {
    resourceKey: "m736974652e66656174757265732e6c656176656f75746f74686572766f69636573783336346533336433",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.leavingisbuiltin": {
    resourceKey: "m736974652e66656174757265732e6c656176696e6769736275696c74696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.letyouragentsreadfromyourjournal": {
    resourceKey: "m736974652e66656174757265732e6c6574796f75726167656e74737265616466726f6d796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.linksthatopenyourjournalatthe": {
    resourceKey: "m736974652e66656174757265732e6c696e6b73746861746f70656e796f75726a6f75726e616c6174746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.localconfidentialprocessingoryourownmodel": {
    resourceKey: "m736974652e66656174757265732e6c6f63616c636f6e666964656e7469616c70726f63657373696e676f72796f75726f776e6d6f64656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.macbrowserextension": {
    resourceKey: "m736974652e66656174757265732e6d616362726f77736572657874656e73696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.n13mayreadingsandcountsasthey": {
    resourceKey: "m736974652e66656174757265732e6e31336d617972656164696e6773616e64636f756e7473617374686579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.n22octoberthejournalssummaryof": {
    resourceKey: "m736974652e66656174757265732e6e32326f63746f6265727468656a6f75726e616c7373756d6d6172796f66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.nativeappsoneveryplatformbrowserextensions": {
    resourceKey: "m736974652e66656174757265732e6e6174697665617070736f6e6576657279706c6174666f726d62726f77736572657874656e73696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.nothingissentuntilyousayit": {
    resourceKey: "m736974652e66656174757265732e6e6f7468696e67697373656e74756e74696c796f757361796974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.obsidiannotescomeinontheirown": {
    resourceKey: "m736974652e66656174757265732e6f6273696469616e6e6f746573636f6d65696e6f6e74686569726f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.offuntilyouturniton": {
    resourceKey: "m736974652e66656174757265732e6f6666756e74696c796f757475726e69746f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.onameetingwhosaiditwhat": {
    resourceKey: "m736974652e66656174757265732e6f6e616d656574696e6777686f73616964697477686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.onedayofapplehealthreadingsand": {
    resourceKey: "m736974652e66656174757265732e6f6e656461796f666170706c656865616c746872656164696e6773616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.onedayofthedemojournalas": {
    resourceKey: "m736974652e66656174757265732e6f6e656461796f6674686564656d6f6a6f75726e616c6173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.onlinuxonlyyourowndesktop": {
    resourceKey: "m736974652e66656174757265732e6f6e6c696e75786f6e6c79796f75726f776e6465736b746f70",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.onmacandwindowsappsyouleave": {
    resourceKey: "m736974652e66656174757265732e6f6e6d6163616e6477696e646f777361707073796f756c65617665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.onthesamecomputeronyourown": {
    resourceKey: "m736974652e66656174757265732e6f6e74686573616d65636f6d70757465726f6e796f75726f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.onyourownvpnorthroughprivate": {
    resourceKey: "m736974652e66656174757265732e6f6e796f75726f776e76706e6f727468726f75676870726976617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.onyourownvpnorthroughprivatexd61cceae": {
    resourceKey: "m736974652e66656174757265732e6f6e796f75726f776e76706e6f727468726f75676870726976617465786436316363656165",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.peoplewiththephotoyouchoose": {
    resourceKey: "m736974652e66656174757265732e70656f706c657769746874686570686f746f796f7563686f6f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.placesarenamedfromdatathatcomes": {
    resourceKey: "m736974652e66656174757265732e706c616365736172656e616d656466726f6d6461746174686174636f6d6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.pointtheappatavaultand": {
    resourceKey: "m736974652e66656174757265732e706f696e747468656170706174617661756c74616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.privacybuiltin": {
    resourceKey: "m736974652e66656174757265732e707269766163796275696c74696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.quotessaidbyyouinaweek": {
    resourceKey: "m736974652e66656174757265732e71756f746573736169646279796f75696e617765656b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.reachyourjournalfromanywhereonany": {
    resourceKey: "m736974652e66656174757265732e7265616368796f75726a6f75726e616c66726f6d616e7977686572656f6e616e79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.reachyourjournalfromanywhereonanyxfeca493e": {
    resourceKey: "m736974652e66656174757265732e7265616368796f75726a6f75726e616c66726f6d616e7977686572656f6e616e79786665636134393365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.readthemdeletethemandtheystay": {
    resourceKey: "m736974652e66656174757265732e726561647468656d64656c6574657468656d616e647468657973746179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.releasesaresignedmostarepubliclyrecorded": {
    resourceKey: "m736974652e66656174757265732e72656c65617365736172657369676e65646d6f73746172657075626c69636c797265636f72646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.releasesyoucancheck": {
    resourceKey: "m736974652e66656174757265732e72656c6561736573796f7563616e636865636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.remembering": {
    resourceKey: "m736974652e66656174757265732e72656d656d626572696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.saidbyyoutheweekof30": {
    resourceKey: "m736974652e66656174757265732e736169646279796f757468657765656b6f663330",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.samecomputeronepress": {
    resourceKey: "m736974652e66656174757265732e73616d65636f6d70757465726f6e657072657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.saywhospokewhatactuallyhappenedor": {
    resourceKey: "m736974652e66656174757265732e73617977686f73706f6b657768617461637475616c6c7968617070656e65646f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.searchresultsforromeointhedemo": {
    resourceKey: "m736974652e66656174757265732e736561726368726573756c7473666f72726f6d656f696e74686564656d6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeeachlayer": {
    resourceKey: "m736974652e66656174757265732e736565656163686c61796572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seehoweachsolstoneappdoesthese": {
    resourceKey: "m736974652e66656174757265732e736565686f7765616368736f6c73746f6e65617070646f65737468657365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalacall": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c6163616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournaladay": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c61646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalameeting": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c616d656574696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalameetingx4ba371bb": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c616d656574696e67783462613337316262",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalanagent": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c616e6167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalaperson": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c61706572736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalapicture": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c6170696374757265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalatranscript": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c617472616e736372697074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalclaudeconnected": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c636c61756465636f6e6e6563746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournaloneday": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c6f6e65646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalquotessaid": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c71756f74657373616964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalsearchresults": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c736561726368726573756c7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalthejournal": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c7468656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalthejournalx1233b6ba": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c7468656a6f75726e616c783132333362366261",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalthejournalx7e394e7e": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c7468656a6f75726e616c783765333934653765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalthejournalx897fd444": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c7468656a6f75726e616c783839376664343434",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalthejournalxcef07bc4": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c7468656a6f75726e616c786365663037626334",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalthejournalxd037b82f": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c7468656a6f75726e616c786430333762383266",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalthejournalxed61775e": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c7468656a6f75726e616c786564363137373565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournaltheleave": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c7468656c65617665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournaltheways": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c74686577617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.seeitinajournalyourjournal": {
    resourceKey: "m736974652e66656174757265732e7365656974696e616a6f75726e616c796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.show": {
    resourceKey: "m736974652e66656174757265732e73686f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.solpbcrunsityourjournalverifies": {
    resourceKey: "m736974652e66656174757265732e736f6c70626372756e736974796f75726a6f75726e616c7665726966696573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.somanycapabilitiessearchorfilterby": {
    resourceKey: "m736974652e66656174757265732e736f6d616e796361706162696c69746965737365617263686f7266696c7465726279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.sourcesondevicesyoulivewith": {
    resourceKey: "m736974652e66656174757265732e736f75726365736f6e64657669636573796f756c69766577697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.streamingvideostepsaside": {
    resourceKey: "m736974652e66656174757265732e73747265616d696e67766964656f73746570736173696465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.switchingjournalsneverloseswhatson": {
    resourceKey: "m736974652e66656174757265732e737769746368696e676a6f75726e616c736e657665726c6f73657377686174736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thatsnotrightchangesthejournal": {
    resourceKey: "m736974652e66656174757265732e74686174736e6f7472696768746368616e6765737468656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thatsnotrightchangesthejournalx4afc1fa5": {
    resourceKey: "m736974652e66656174757265732e74686174736e6f7472696768746368616e6765737468656a6f75726e616c783461666331666135",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.theaudiowhatyourjournalrecognizedin": {
    resourceKey: "m736974652e66656174757265732e746865617564696f77686174796f75726a6f75726e616c7265636f676e697a6564696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thedemojournals2025asa": {
    resourceKey: "m736974652e66656174757265732e74686564656d6f6a6f75726e616c7332303235617361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thedemojournalsuniquemark": {
    resourceKey: "m736974652e66656174757265732e74686564656d6f6a6f75726e616c73756e697175656d61726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thedemoyeareachdaycoloredby": {
    resourceKey: "m736974652e66656174757265732e74686564656d6f7965617265616368646179636f6c6f7265646279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thefulllist": {
    resourceKey: "m736974652e66656174757265732e74686566756c6c6c697374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsbackuppage": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c736261636b757070616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsexportcontrol": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c736578706f7274636f6e74726f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsimportpage": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c73696d706f727470616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsmarkalwaysconfirmit": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c736d61726b616c77617973636f6e6669726d6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsmarkalwaysconfirmitxf3f7c1d9": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c736d61726b616c77617973636f6e6669726d6974786633663763316439",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsmarktwoiconsand": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c736d61726b74776f69636f6e73616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsnetworkpage": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c736e6574776f726b70616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsnetworkpageyourown": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c736e6574776f726b70616765796f75726f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsretentionsettings": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c73726574656e74696f6e73657474696e6773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalssummaryofwednesday22": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c7373756d6d6172796f667765646e65736461793232",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsthinkingpagelocalactive": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c737468696e6b696e67706167656c6f63616c616374697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thejournalsthinkingpagewithlocal": {
    resourceKey: "m736974652e66656174757265732e7468656a6f75726e616c737468696e6b696e6770616765776974686c6f63616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.theleaveoutothervoicessetting": {
    resourceKey: "m736974652e66656174757265732e7468656c656176656f75746f74686572766f6963657373657474696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.theleaveoutothervoicessettingswitched": {
    resourceKey: "m736974652e66656174757265732e7468656c656176656f75746f74686572766f6963657373657474696e677377697463686564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thelist": {
    resourceKey: "m736974652e66656174757265732e7468656c697374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.themicrophoneneverturnsitselfbackon": {
    resourceKey: "m736974652e66656174757265732e7468656d6963726f70686f6e656e657665727475726e73697473656c666261636b6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.theoneswedshowyoufirst": {
    resourceKey: "m736974652e66656174757265732e7468656f6e657377656473686f77796f756669727374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thescreenshotsyoutake": {
    resourceKey: "m736974652e66656174757265732e74686573637265656e73686f7473796f7574616b65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thescreensyoullseearereal": {
    resourceKey: "m736974652e66656174757265732e74686573637265656e73796f756c6c7365656172657265616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thesolstoneappforlinuxtakesin": {
    resourceKey: "m736974652e66656174757265732e746865736f6c73746f6e65617070666f726c696e757874616b6573696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thesolstoneextensiontakesintextnot": {
    resourceKey: "m736974652e66656174757265732e746865736f6c73746f6e65657874656e73696f6e74616b6573696e746578746e6f74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thesourcesyouaddtoyourjournal": {
    resourceKey: "m736974652e66656174757265732e746865736f7572636573796f75616464746f796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thethatsnotrightmenuon": {
    resourceKey: "m736974652e66656174757265732e74686574686174736e6f7472696768746d656e756f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thethreeplacesthinkingcanrunwith": {
    resourceKey: "m736974652e66656174757265732e7468657468726565706c616365737468696e6b696e6763616e72756e77697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thewaysanagentreachesthejournal": {
    resourceKey: "m736974652e66656174757265732e74686577617973616e6167656e74726561636865737468656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thewaysin": {
    resourceKey: "m736974652e66656174757265732e74686577617973696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.theweekof30novemberinthe": {
    resourceKey: "m736974652e66656174757265732e7468657765656b6f6633306e6f76656d626572696e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.theweekof30novemberonememory": {
    resourceKey: "m736974652e66656174757265732e7468657765656b6f6633306e6f76656d6265726f6e656d656d6f7279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thewordsandthetimescomefrom": {
    resourceKey: "m736974652e66656174757265732e746865776f726473616e6474686574696d6573636f6d6566726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thewordsastranscribedwithapossible": {
    resourceKey: "m736974652e66656174757265732e746865776f72647361737472616e736372696265647769746861706f737369626c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thewordsofameetingastranscribed": {
    resourceKey: "m736974652e66656174757265732e746865776f7264736f66616d656574696e6761737472616e73637269626564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thewordsofameetingeachline": {
    resourceKey: "m736974652e66656174757265732e746865776f7264736f66616d656574696e67656163686c696e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thinkinghappenswhereyouchoose": {
    resourceKey: "m736974652e66656174757265732e7468696e6b696e6768617070656e737768657265796f7563686f6f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.thinkinghappenswhereyouchoosexba0a0c37": {
    resourceKey: "m736974652e66656174757265732e7468696e6b696e6768617070656e737768657265796f7563686f6f7365786261306130633337",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.toptenfeatures": {
    resourceKey: "m736974652e66656174757265732e746f7074656e6665617475726573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.toyourownstorageorstoragesol": {
    resourceKey: "m736974652e66656174757265732e746f796f75726f776e73746f726167656f7273746f72616765736f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.tryvoicescalendarwindowsdelete": {
    resourceKey: "m736974652e66656174757265732e747279766f6963657363616c656e64617277696e646f777364656c657465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.turnitonandeachnewrecording": {
    resourceKey: "m736974652e66656174757265732e7475726e69746f6e616e64656163686e65777265636f7264696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.turnitonandstretcheswhereonly": {
    resourceKey: "m736974652e66656174757265732e7475726e69746f6e616e6473747265746368657377686572656f6e6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.turnonterminalandyourtmuxsessions": {
    resourceKey: "m736974652e66656174757265732e7475726e6f6e7465726d696e616c616e64796f7572746d757873657373696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.twoiconstwocolorsandtwowords": {
    resourceKey: "m736974652e66656174757265732e74776f69636f6e7374776f636f6c6f7273616e6474776f776f726473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.twoiconstwocolorsandtwowordsxb2d93e78": {
    resourceKey: "m736974652e66656174757265732e74776f69636f6e7374776f636f6c6f7273616e6474776f776f726473786232643933653738",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whatadevicetookinthathasn": {
    resourceKey: "m736974652e66656174757265732e7768617461646576696365746f6f6b696e746861746861736e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whateachapptookinwaitson": {
    resourceKey: "m736974652e66656174757265732e7768617465616368617070746f6f6b696e77616974736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whatmakessolstonedifferent": {
    resourceKey: "m736974652e66656174757265732e776861746d616b6573736f6c73746f6e65646966666572656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whatmakessolstonedifferentwithscreensfrom": {
    resourceKey: "m736974652e66656174757265732e776861746d616b6573736f6c73746f6e65646966666572656e747769746873637265656e7366726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whatsolstonedoes": {
    resourceKey: "m736974652e66656174757265732e77686174736f6c73746f6e65646f6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whatsolstonedoessolstone": {
    resourceKey: "m736974652e66656174757265732e77686174736f6c73746f6e65646f6573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whatyoucanbringin": {
    resourceKey: "m736974652e66656174757265732e77686174796f7563616e6272696e67696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whenanameismisheardyourjournal": {
    resourceKey: "m736974652e66656174757265732e7768656e616e616d6569736d69736865617264796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whenindoubtyourjournalkeepsit": {
    resourceKey: "m736974652e66656174757265732e7768656e696e646f756274796f75726a6f75726e616c6b656570736974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whennetflixdisneyorprimevideois": {
    resourceKey: "m736974652e66656174757265732e7768656e6e6574666c69786469736e65796f727072696d65766964656f6973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whereabackupgoesanditsrecovery": {
    resourceKey: "m736974652e66656174757265732e7768657265616261636b7570676f6573616e646974737265636f76657279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whileasiteyouvelistedis": {
    resourceKey: "m736974652e66656174757265732e7768696c656173697465796f7576656c69737465646973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.whosaidwhatworkedoutstepby": {
    resourceKey: "m736974652e66656174757265732e77686f7361696477686174776f726b65646f7574737465706279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.withnolimitsetoralimit": {
    resourceKey: "m736974652e66656174757265732e776974686e6f6c696d69747365746f72616c696d6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.withscreensfromthedemojournal": {
    resourceKey: "m736974652e66656174757265732e7769746873637265656e7366726f6d74686564656d6f6a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.workson": {
    resourceKey: "m736974652e66656174757265732e776f726b736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.workswiththeagentsyoualreadyuse": {
    resourceKey: "m736974652e66656174757265732e776f726b73776974687468656167656e7473796f75616c7265616479757365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.youragentcangiveyoulinksto": {
    resourceKey: "m736974652e66656174757265732e796f75726167656e7463616e67697665796f756c696e6b73746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.youragents": {
    resourceKey: "m736974652e66656174757265732e796f75726167656e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.youragentsreachyourjournaltheway": {
    resourceKey: "m736974652e66656174757265732e796f75726167656e74737265616368796f75726a6f75726e616c746865776179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.youragentsreadonlywhatyoulet": {
    resourceKey: "m736974652e66656174757265732e796f75726167656e7473726561646f6e6c7977686174796f756c6574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourdayyourweekandyouryear": {
    resourceKey: "m736974652e66656174757265732e796f7572646179796f75727765656b616e64796f757279656172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourdayyourweekandyouryearx246a80d2": {
    resourceKey: "m736974652e66656174757265732e796f7572646179796f75727765656b616e64796f757279656172783234366138306432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourdevices": {
    resourceKey: "m736974652e66656174757265732e796f757264657669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourgranolameetingscomein": {
    resourceKey: "m736974652e66656174757265732e796f75726772616e6f6c616d656574696e6773636f6d65696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourjournalfindsfacesinyourmeeting": {
    resourceKey: "m736974652e66656174757265732e796f75726a6f75726e616c66696e64736661636573696e796f75726d656574696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourjournalisjustafolderyou": {
    resourceKey: "m736974652e66656174757265732e796f75726a6f75726e616c69736a75737461666f6c646572796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourjournalisjustafolderyouxd4cfecad": {
    resourceKey: "m736974652e66656174757265732e796f75726a6f75726e616c69736a75737461666f6c646572796f75786434636665636164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourjournalsaccountofnotesfrom": {
    resourceKey: "m736974652e66656174757265732e796f75726a6f75726e616c736163636f756e746f666e6f74657366726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourownnetworkbydefaultprivatenetwork": {
    resourceKey: "m736974652e66656174757265732e796f75726f776e6e6574776f726b627964656661756c74707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourownvoicefirstthenwhowas": {
    resourceKey: "m736974652e66656174757265732e796f75726f776e766f69636566697273747468656e77686f776173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yoursleepstepsandworkoutsasthey": {
    resourceKey: "m736974652e66656174757265732e796f7572736c6565707374657073616e64776f726b6f757473617374686579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourterminalastext": {
    resourceKey: "m736974652e66656174757265732e796f75727465726d696e616c617374657874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.features.yourwatchhandsoffwithcare": {
    resourceKey: "m736974652e66656174757265732e796f7572776174636868616e64736f66667769746863617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresbrowser.capabilities": {
    resourceKey: "m736974652e666561747572657362726f777365722e6361706162696c6974696573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresbrowser.showing": {
    resourceKey: "m736974652e666561747572657362726f777365722e73686f77696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresbrowser.showing1capability": {
    resourceKey: "m736974652e666561747572657362726f777365722e73686f77696e67316361706162696c697479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresbrowser.tryashorterwordoranydevice": {
    resourceKey: "m736974652e666561747572657362726f777365722e7472796173686f72746572776f72646f72616e79646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.afileyourjournalturnedawayis": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6166696c65796f75726a6f75726e616c7475726e6564617761796973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.androidssenderandhowwaitingmaterial": {
    resourceKey: "m736974652e6665617475726573637573746f64792e616e64726f69647373656e646572616e64686f7777616974696e676d6174657269616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.anillustrationoffiveminutesona": {
    resourceKey: "m736974652e6665617475726573637573746f64792e616e696c6c757374726174696f6e6f66666976656d696e757465736f6e61",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.anythingelsestaysandgoesagainlater": {
    resourceKey: "m736974652e6665617475726573637573746f64792e616e797468696e67656c73657374617973616e64676f6573616761696e6c61746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.aquickcheckthatafilelooks": {
    resourceKey: "m736974652e6665617475726573637573746f64792e61717569636b636865636b746861746166696c656c6f6f6b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.areportoneveryfile": {
    resourceKey: "m736974652e6665617475726573637573746f64792e617265706f72746f6e657665727966696c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.available": {
    resourceKey: "m736974652e6665617475726573637573746f64792e617661696c61626c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.beforeanythinggoesthesolstoneappfor": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6265666f7265616e797468696e67676f6573746865736f6c73746f6e65617070666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.checkseachfileagainst": {
    resourceKey: "m736974652e6665617475726573637573746f64792e636865636b736561636866696c65616761696e7374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.checksitsowncopyagain": {
    resourceKey: "m736974652e6665617475726573637573746f64792e636865636b736974736f776e636f7079616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.eachfilegoestoyourjournalwith": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6561636866696c65676f6573746f796f75726a6f75726e616c77697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.eachfileisfingerprintedwithsha256": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6561636866696c65697366696e6765727072696e74656477697468736861323536",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.eachfiletheapptakesinwaits": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6561636866696c6574686561707074616b6573696e7761697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.everyapp": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6576657279617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.everysolstoneapp": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6576657279736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.everysolstoneappfollowsthesamerule": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6576657279736f6c73746f6e65617070666f6c6c6f777374686573616d6572756c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.featuresprivacy": {
    resourceKey: "m736974652e6665617475726573637573746f64792e666561747572657370726976616379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.fingerprintseachfile": {
    resourceKey: "m736974652e6665617475726573637573746f64792e66696e6765727072696e74736561636866696c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.godeeper": {
    resourceKey: "m736974652e6665617475726573637573746f64792e676f646565706572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.howadevicehandsfilestoyour": {
    resourceKey: "m736974652e6665617475726573637573746f64792e686f776164657669636568616e647366696c6573746f796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.howitschecked": {
    resourceKey: "m736974652e6665617475726573637573746f64792e686f77697473636865636b6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.howthesolstoneappformacreads": {
    resourceKey: "m736974652e6665617475726573637573746f64792e686f77746865736f6c73746f6e65617070666f726d61637265616473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.howyourjournalcheckseachfileand": {
    resourceKey: "m736974652e6665617475726573637573746f64792e686f77796f75726a6f75726e616c636865636b736561636866696c65616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.iftheconnectiondrops": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6966746865636f6e6e656374696f6e64726f7073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.ifyouunpairormovetoanother": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6966796f75756e706169726f726d6f7665746f616e6f74686572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.inyourjournal": {
    resourceKey: "m736974652e6665617475726573637573746f64792e696e796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.itremovesonlywhatwaswrittenor": {
    resourceKey: "m736974652e6665617475726573637573746f64792e697472656d6f7665736f6e6c79776861747761737772697474656e6f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.itreportsoneveryfilewrittenalready": {
    resourceKey: "m736974652e6665617475726573637573746f64792e69747265706f7274736f6e657665727966696c657772697474656e616c7265616479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.itsfingerprintthenwritesitifit": {
    resourceKey: "m736974652e6665617475726573637573746f64792e69747366696e6765727072696e747468656e777269746573697469666974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.macwindowslinux": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6d616377696e646f77736c696e7578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.n1takenin": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6e3174616b656e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.n2onitsway": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6e326f6e697473776179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.n3answered": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6e33616e737765726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.n4after": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6e346166746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.oneachdevice": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6f6e65616368646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.onyourphone": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6f6e796f757270686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.oralreadyheld": {
    resourceKey: "m736974652e6665617475726573637573746f64792e6f72616c726561647968656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.removesonlywhatwaswritten": {
    resourceKey: "m736974652e6665617475726573637573746f64792e72656d6f7665736f6e6c79776861747761737772697474656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.safesecuresyncbetweenyourdevicesand": {
    resourceKey: "m736974652e6665617475726573637573746f64792e7361666573656375726573796e636265747765656e796f757264657669636573616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.safesecuresyncbetweenyourdevicesandxff077e92": {
    resourceKey: "m736974652e6665617475726573637573746f64792e7361666573656375726573796e636265747765656e796f757264657669636573616e64786666303737653932",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.seeeachtopicdevicebydevice": {
    resourceKey: "m736974652e6665617475726573637573746f64792e73656565616368746f7069636465766963656279646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.seeithappen": {
    resourceKey: "m736974652e6665617475726573637573746f64792e736565697468617070656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.stepthroughit": {
    resourceKey: "m736974652e6665617475726573637573746f64792e737465707468726f7567686974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.thedevice": {
    resourceKey: "m736974652e6665617475726573637573746f64792e746865646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.thedeviceandyourjournalcompareeach": {
    resourceKey: "m736974652e6665617475726573637573746f64792e746865646576696365616e64796f75726a6f75726e616c636f6d7061726565616368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.thedevicechecksitsowncopyagain": {
    resourceKey: "m736974652e6665617475726573637573746f64792e746865646576696365636865636b736974736f776e636f7079616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.thedevicefingerprintseachfile": {
    resourceKey: "m736974652e6665617475726573637573746f64792e74686564657669636566696e6765727072696e74736561636866696c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.theexactaccount": {
    resourceKey: "m736974652e6665617475726573637573746f64792e74686565786163746163636f756e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.thefileseachwithitsfingerprint": {
    resourceKey: "m736974652e6665617475726573637573746f64792e74686566696c6573656163687769746869747366696e6765727072696e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.thesameoniphoneandipad": {
    resourceKey: "m736974652e6665617475726573637573746f64792e74686573616d656f6e6970686f6e65616e6469706164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.thewatchshandofftothe": {
    resourceKey: "m736974652e6665617475726573637573746f64792e74686577617463687368616e646f6666746f746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.twolanesthedeviceandyourjournal": {
    resourceKey: "m736974652e6665617475726573637573746f64792e74776f6c616e6573746865646576696365616e64796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.whatasolstoneapptakesinwaits": {
    resourceKey: "m736974652e6665617475726573637573746f64792e7768617461736f6c73746f6e6561707074616b6573696e7761697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.whatasolstoneapptakesinwaitsx4d70b482": {
    resourceKey: "m736974652e6665617475726573637573746f64792e7768617461736f6c73746f6e6561707074616b6573696e7761697473783464373062343832",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.whatthewatchtakesinstayson": {
    resourceKey: "m736974652e6665617475726573637573746f64792e77686174746865776174636874616b6573696e73746179736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.writtenalreadyheldreceivednotwritten": {
    resourceKey: "m736974652e6665617475726573637573746f64792e7772697474656e616c726561647968656c6472656365697665646e6f747772697474656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.yourjournal": {
    resourceKey: "m736974652e6665617475726573637573746f64792e796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featurescustody.yourjournalcheckseachfileagainstits": {
    resourceKey: "m736974652e6665617475726573637573746f64792e796f75726a6f75726e616c636865636b736561636866696c65616761696e7374697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.abroadcastyoustart": {
    resourceKey: "m736974652e6665617475726573646576696365732e6162726f616463617374796f757374617274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.afolderonlyyouraccountcanopen": {
    resourceKey: "m736974652e6665617475726573646576696365732e61666f6c6465726f6e6c79796f75726163636f756e7463616e6f70656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.androidkeystore": {
    resourceKey: "m736974652e6665617475726573646576696365732e616e64726f69646b657973746f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.apairinglinkonepressonthe": {
    resourceKey: "m736974652e6665617475726573646576696365732e6170616972696e676c696e6b6f6e6570726573736f6e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.apairinglinkoronepressfor": {
    resourceKey: "m736974652e6665617475726573646576696365732e6170616972696e676c696e6b6f726f6e657072657373666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.apairinglinkoronepresson": {
    resourceKey: "m736974652e6665617475726573646576696365732e6170616972696e676c696e6b6f726f6e6570726573736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.apauseisonegestureawaywherever": {
    resourceKey: "m736974652e6665617475726573646576696365732e61706175736569736f6e6567657374757265617761797768657265766572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.appsyouleaveoutareblackedout": {
    resourceKey: "m736974652e6665617475726573646576696365732e61707073796f756c656176656f7574617265626c61636b65646f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.ascreenbroadcastyoustartyourselfthe": {
    resourceKey: "m736974652e6665617475726573646576696365732e6173637265656e62726f616463617374796f757374617274796f757273656c66746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.blackedoutdroppedwhenunsure": {
    resourceKey: "m736974652e6665617475726573646576696365732e626c61636b65646f757464726f707065647768656e756e73757265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.builtintothesolstoneappturnon": {
    resourceKey: "m736974652e6665617475726573646576696365732e6275696c74696e746f746865736f6c73746f6e656170707475726e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.builtintothesolstoneappturnonxc054e6a1": {
    resourceKey: "m736974652e6665617475726573646576696365732e6275696c74696e746f746865736f6c73746f6e656170707475726e6f6e786330353465366131",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.checkeddailyandinstalledatthenext": {
    resourceKey: "m736974652e6665617475726573646576696365732e636865636b65646461696c79616e64696e7374616c6c656461747468656e657874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.chooseatopic": {
    resourceKey: "m736974652e6665617475726573646576696365732e63686f6f736561746f706963",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.codepastelink": {
    resourceKey: "m736974652e6665617475726573646576696365732e636f646570617374656c696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.controlcenterwidgetliveactivitysiri": {
    resourceKey: "m736974652e6665617475726573646576696365732e636f6e74726f6c63656e7465727769646765746c697665616374697669747973697269",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.dailysignedwholepackage": {
    resourceKey: "m736974652e6665617475726573646576696365732e6461696c797369676e656477686f6c657061636b616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.dataprotectionkeychain": {
    resourceKey: "m736974652e6665617475726573646576696365732e6461746170726f74656374696f6e6b6579636861696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.devicebydevice": {
    resourceKey: "m736974652e6665617475726573646576696365732e6465766963656279646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.devicebydevicesolstone": {
    resourceKey: "m736974652e6665617475726573646576696365732e6465766963656279646576696365736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.edgeandfirefoxinenglish": {
    resourceKey: "m736974652e6665617475726573646576696365732e65646765616e6466697265666f78696e656e676c697368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.edgeandfirefoxprivatewindowsinenglish": {
    resourceKey: "m736974652e6665617475726573646576696365732e65646765616e6466697265666f787072697661746577696e646f7773696e656e676c697368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.encryptedopenedonthephone": {
    resourceKey: "m736974652e6665617475726573646576696365732e656e637279707465646f70656e65646f6e74686570686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.encryptedpaddedtoonesizeanddelivered": {
    resourceKey: "m736974652e6665617475726573646576696365732e656e63727970746564706164646564746f6f6e6573697a65616e6464656c697665726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.encryptedpaddedtoonesizeandopened": {
    resourceKey: "m736974652e6665617475726573646576696365732e656e63727970746564706164646564746f6f6e6573697a65616e646f70656e6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.encryptedthroughyourphonespushservice": {
    resourceKey: "m736974652e6665617475726573646576696365732e656e637279707465647468726f756768796f757270686f6e65737075736873657276696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.everyappshowsyourjournalsmark": {
    resourceKey: "m736974652e6665617475726573646576696365732e657665727961707073686f7773796f75726a6f75726e616c736d61726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.everydisplay": {
    resourceKey: "m736974652e6665617475726573646576696365732e6576657279646973706c6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.everydisplaythroughthemacsown": {
    resourceKey: "m736974652e6665617475726573646576696365732e6576657279646973706c61797468726f7567687468656d6163736f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.everytopicatonce": {
    resourceKey: "m736974652e6665617475726573646576696365732e6576657279746f70696361746f6e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.everyupdatearrivessigned": {
    resourceKey: "m736974652e6665617475726573646576696365732e6576657279757064617465617272697665737369676e6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.featuresyourdevices": {
    resourceKey: "m736974652e6665617475726573646576696365732e6665617475726573796f757264657669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.firefoxbytitlesafarichromeedgebrave": {
    resourceKey: "m736974652e6665617475726573646576696365732e66697265666f7862797469746c657361666172696368726f6d65656467656272617665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.firefoxprivatewindowsbytheirtitlesafari": {
    resourceKey: "m736974652e6665617475726573646576696365732e66697265666f787072697661746577696e646f7773627974686569727469746c65736166617269",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.fromcontrolcenterawidgetthelive": {
    resourceKey: "m736974652e6665617475726573646576696365732e66726f6d636f6e74726f6c63656e746572617769646765747468656c697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.fromthemenubarorashortcut": {
    resourceKey: "m736974652e6665617475726573646576696365732e66726f6d7468656d656e756261726f726173686f7274637574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.fromthenotificationorawidget": {
    resourceKey: "m736974652e6665617475726573646576696365732e66726f6d7468656e6f74696669636174696f6e6f7261776964676574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.fromthetrayorahotkeyit": {
    resourceKey: "m736974652e6665617475726573646576696365732e66726f6d746865747261796f7261686f746b65796974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.fromthetraythecommandlineor": {
    resourceKey: "m736974652e6665617475726573646576696365732e66726f6d74686574726179746865636f6d6d616e646c696e656f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.googleplayorasignedapkfrom": {
    resourceKey: "m736974652e6665617475726573646576696365732e676f6f676c65706c61796f72617369676e656461706b66726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.googleplayorsignedapk": {
    resourceKey: "m736974652e6665617475726573646576696365732e676f6f676c65706c61796f727369676e656461706b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.howeachsolstoneappdoeseachthing": {
    resourceKey: "m736974652e6665617475726573646576696365732e686f7765616368736f6c73746f6e65617070646f6573656163687468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.howeachsolstoneapphandlesyourscreen": {
    resourceKey: "m736974652e6665617475726573646576696365732e686f7765616368736f6c73746f6e6561707068616e646c6573796f757273637265656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.inafolderonlyyouraccountcan": {
    resourceKey: "m736974652e6665617475726573646576696365732e696e61666f6c6465726f6e6c79796f75726163636f756e7463616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.inthekeychainonthisdeviceonly": {
    resourceKey: "m736974652e6665617475726573646576696365732e696e7468656b6579636861696e6f6e746869736465766963656f6e6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.inthemacsdataprotectionkeychain": {
    resourceKey: "m736974652e6665617475726573646576696365732e696e7468656d6163736461746170726f74656374696f6e6b6579636861696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.iphone": {
    resourceKey: "m736974652e6665617475726573646576696365732e6970686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.keepingkeys": {
    resourceKey: "m736974652e6665617475726573646576696365732e6b656570696e676b657973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.keepingthingsout": {
    resourceKey: "m736974652e6665617475726573646576696365732e6b656570696e677468696e67736f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.keychainthisdeviceonly": {
    resourceKey: "m736974652e6665617475726573646576696365732e6b6579636861696e746869736465766963656f6e6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.leftoutfromthefirstframe": {
    resourceKey: "m736974652e6665617475726573646576696365732e6c6566746f757466726f6d74686566697273746672616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.linkorsamemac": {
    resourceKey: "m736974652e6665617475726573646576696365732e6c696e6b6f7273616d656d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.linkorsamepc": {
    resourceKey: "m736974652e6665617475726573646576696365732e6c696e6b6f7273616d657063",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.linksamecomputercommandline": {
    resourceKey: "m736974652e6665617475726573646576696365732e6c696e6b73616d65636f6d7075746572636f6d6d616e646c696e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.linuxdoesnttellapps": {
    resourceKey: "m736974652e6665617475726573646576696365732e6c696e7578646f65736e7474656c6c61707073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.linuxdoesnttellappswhichwindows": {
    resourceKey: "m736974652e6665617475726573646576696365732e6c696e7578646f65736e7474656c6c61707073776869636877696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.localnotices": {
    resourceKey: "m736974652e6665617475726573646576696365732e6c6f63616c6e6f7469636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.lockscreengate": {
    resourceKey: "m736974652e6665617475726573646576696365732e6c6f636b73637265656e67617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.maindisplay": {
    resourceKey: "m736974652e6665617475726573646576696365732e6d61696e646973706c6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.menushortcutholds": {
    resourceKey: "m736974652e6665617475726573646576696365732e6d656e7573686f7274637574686f6c6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.mic": {
    resourceKey: "m736974652e6665617475726573646576696365732e6d6963",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.micandthewatchs": {
    resourceKey: "m736974652e6665617475726573646576696365732e6d6963616e64746865776174636873",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.none": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.nopushnotifications": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f707573686e6f74696669636174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.noseparatehandling": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f736570617261746568616e646c696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.nothingistakenfromthelockscreen": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f7468696e67697374616b656e66726f6d7468656c6f636b73637265656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.notifications": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f74696669636174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.notificationwidget": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f74696669636174696f6e776964676574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.notonandroid": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f746f6e616e64726f6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.notoniphoneoripad": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f746f6e6970686f6e656f7269706164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.notonlinuxanditsaysso": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f746f6e6c696e7578616e64697473617973736f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.notonwindows": {
    resourceKey: "m736974652e6665617475726573646576696365732e6e6f746f6e77696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.offwhenlocked": {
    resourceKey: "m736974652e6665617475726573646576696365732e6f66667768656e6c6f636b6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.onlythesourcesyouturnon": {
    resourceKey: "m736974652e6665617475726573646576696365732e6f6e6c79746865736f7572636573796f757475726e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.onlywhileyouhaveiton": {
    resourceKey: "m736974652e6665617475726573646576696365732e6f6e6c797768696c65796f756861766569746f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.pairing": {
    resourceKey: "m736974652e6665617475726573646576696365732e70616972696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.pausing": {
    resourceKey: "m736974652e6665617475726573646576696365732e70617573696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.portalorx11": {
    resourceKey: "m736974652e6665617475726573646576696365732e706f7274616c6f72783131",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.privatewindows": {
    resourceKey: "m736974652e6665617475726573646576696365732e7072697661746577696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.protectedbywindowsforyouraccount": {
    resourceKey: "m736974652e6665617475726573646576696365732e70726f746563746564627977696e646f7773666f72796f75726163636f756e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.pulseaudioorpipewire": {
    resourceKey: "m736974652e6665617475726573646576696365732e70756c7365617564696f6f727069706577697265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.pushnotificationsareencryptedontheway": {
    resourceKey: "m736974652e6665617475726573646576696365732e707573686e6f74696669636174696f6e73617265656e637279707465646f6e746865776179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.scanacodepastealinkor": {
    resourceKey: "m736974652e6665617475726573646576696365732e7363616e61636f64657061737465616c696e6b6f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.seeeverythingsolstonedoes": {
    resourceKey: "m736974652e6665617475726573646576696365732e73656565766572797468696e67736f6c73746f6e65646f6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.showthewholetable": {
    resourceKey: "m736974652e6665617475726573646576696365732e73686f7774686577686f6c657461626c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.signeddebrpmortarball": {
    resourceKey: "m736974652e6665617475726573646576696365732e7369676e656464656272706d6f7274617262616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.signedintheapp": {
    resourceKey: "m736974652e6665617475726573646576696365732e7369676e6564696e746865617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.signedpackagesdebrpmoratarball": {
    resourceKey: "m736974652e6665617475726573646576696365732e7369676e65647061636b6167657364656272706d6f726174617262616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.signedupdatestheappchecksforitself": {
    resourceKey: "m736974652e6665617475726573646576696365732e7369676e656475706461746573746865617070636865636b73666f72697473656c66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.solstoneonanapplewatch2minutes": {
    resourceKey: "m736974652e6665617475726573646576696365732e736f6c73746f6e656f6e616e6170706c657761746368326d696e75746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.solstoneonaniphonegoodafternoonaudio": {
    resourceKey: "m736974652e6665617475726573646576696365732e736f6c73746f6e656f6e616e6970686f6e65676f6f6461667465726e6f6f6e617564696f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.solstoneonwindowsgoodeveningscreenon": {
    resourceKey: "m736974652e6665617475726573646576696365732e736f6c73746f6e656f6e77696e646f7773676f6f646576656e696e6773637265656e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.sound": {
    resourceKey: "m736974652e6665617475726573646576696365732e736f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.systemendstheshareonlock": {
    resourceKey: "m736974652e6665617475726573646576696365732e73797374656d656e647374686573686172656f6e6c6f636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.systemsoundandeverymic": {
    resourceKey: "m736974652e6665617475726573646576696365732e73797374656d736f756e64616e6465766572796d6963",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.systemsoundandonemic": {
    resourceKey: "m736974652e6665617475726573646576696365732e73797374656d736f756e64616e646f6e656d6963",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.theappsownnoticesshownon": {
    resourceKey: "m736974652e6665617475726573646576696365732e746865617070736f776e6e6f746963657373686f776e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.theappstore": {
    resourceKey: "m736974652e6665617475726573646576696365732e74686561707073746f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.thekeyadeviceusestoreach": {
    resourceKey: "m736974652e6665617475726573646576696365732e7468656b65796164657669636575736573746f7265616368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.themicrophone": {
    resourceKey: "m736974652e6665617475726573646576696365732e7468656d6963726f70686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.themicrophoneandanapplewatchs": {
    resourceKey: "m736974652e6665617475726573646576696365732e7468656d6963726f70686f6e65616e64616e6170706c65776174636873",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.thesolstoneappforlinuxcant": {
    resourceKey: "m736974652e6665617475726573646576696365732e746865736f6c73746f6e65617070666f726c696e757863616e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.thesystemitselfstopsthebroadcastwhen": {
    resourceKey: "m736974652e6665617475726573646576696365732e74686573797374656d697473656c6673746f707374686562726f6164636173747768656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.thesystemleavesouttheappsyou": {
    resourceKey: "m736974652e6665617475726573646576696365732e74686573797374656d6c65617665736f757474686561707073796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.throughpulseaudioorpipewire": {
    resourceKey: "m736974652e6665617475726573646576696365732e7468726f75676870756c7365617564696f6f727069706577697265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.throughthedesktopsscreensharingportal": {
    resourceKey: "m736974652e6665617475726573646576696365732e7468726f7567687468656465736b746f707373637265656e73686172696e67706f7274616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.tmuxintheapp": {
    resourceKey: "m736974652e6665617475726573646576696365732e746d7578696e746865617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.traycommandlinedbusholds": {
    resourceKey: "m736974652e6665617475726573646576696365732e74726179636f6d6d616e646c696e6564627573686f6c6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.trayhotkeyholds": {
    resourceKey: "m736974652e6665617475726573646576696365732e74726179686f746b6579686f6c6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.updates": {
    resourceKey: "m736974652e6665617475726573646576696365732e75706461746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.whereasystemletsanapptell": {
    resourceKey: "m736974652e6665617475726573646576696365732e77686572656173797374656d6c657473616e61707074656c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.wherethesystemallowsitwhatyou": {
    resourceKey: "m736974652e6665617475726573646576696365732e776865726574686573797374656d616c6c6f7773697477686174796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.windowsforyouraccount": {
    resourceKey: "m736974652e6665617475726573646576696365732e77696e646f7773666f72796f75726163636f756e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.withyourconsenteachsessionandnever": {
    resourceKey: "m736974652e6665617475726573646576696365732e77697468796f7572636f6e73656e746561636873657373696f6e616e646e65766572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.wrappedbytheandroidkeystore": {
    resourceKey: "m736974652e6665617475726573646576696365732e777261707065646279746865616e64726f69646b657973746f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.yourmacsownsoundandevery": {
    resourceKey: "m736974652e6665617475726573646576696365732e796f75726d6163736f776e736f756e64616e646576657279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.yourmaindisplaythroughwindowsownscreen": {
    resourceKey: "m736974652e6665617475726573646576696365732e796f75726d61696e646973706c61797468726f75676877696e646f77736f776e73637265656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.yourpcsownsoundandone": {
    resourceKey: "m736974652e6665617475726573646576696365732e796f75727063736f776e736f756e64616e646f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.yourscreen": {
    resourceKey: "m736974652e6665617475726573646576696365732e796f757273637265656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.yourterminal": {
    resourceKey: "m736974652e6665617475726573646576696365732e796f75727465726d696e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresdevices.yourtmuxsessionscomeintoyourjournal": {
    resourceKey: "m736974652e6665617475726573646576696365732e796f7572746d757873657373696f6e73636f6d65696e746f796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.acallwitheachlineattributedto": {
    resourceKey: "m736974652e666561747572657365766964656e63652e6163616c6c77697468656163686c696e6561747472696275746564746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.acallwithhisbrothertwovoices": {
    resourceKey: "m736974652e666561747572657365766964656e63652e6163616c6c7769746868697362726f7468657274776f766f69636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.ameetingsaccountintheowner": {
    resourceKey: "m736974652e666561747572657365766964656e63652e616d656574696e67736163636f756e74696e7468656f776e6572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.ameetingtranscripteachlinewiththe": {
    resourceKey: "m736974652e666561747572657365766964656e63652e616d656574696e677472616e736372697074656163686c696e6577697468746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.correctionsacorrectionshowsontheactivity": {
    resourceKey: "m736974652e666561747572657365766964656e63652e636f7272656374696f6e7361636f7272656374696f6e73686f77736f6e7468656163746976697479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.featuresremembering": {
    resourceKey: "m736974652e666561747572657365766964656e63652e666561747572657372656d656d626572696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.fromademojournalwewrotea": {
    resourceKey: "m736974652e666561747572657365766964656e63652e66726f6d6164656d6f6a6f75726e616c776577726f746561",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.howanimportedtranscriptkeepsitsown": {
    resourceKey: "m736974652e666561747572657365766964656e63652e686f77616e696d706f727465647472616e7363726970746b656570736974736f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.howaquoteiscopiedexactly": {
    resourceKey: "m736974652e666561747572657365766964656e63652e686f776171756f74656973636f7069656465786163746c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.howyourjournalkeepswhatyouadd": {
    resourceKey: "m736974652e666561747572657365766964656e63652e686f77796f75726a6f75726e616c6b6565707377686174796f75616464",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.importedtranscriptsthewordsandtimescome": {
    resourceKey: "m736974652e666561747572657365766964656e63652e696d706f727465647472616e73637269707473746865776f726473616e6474696d6573636f6d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.layer3rsandwhospokerswhosaid": {
    resourceKey: "m736974652e666561747572657365766964656e63652e6c61796572337273616e6477686f73706f6b65727377686f73616964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.meetingsandacallfromthedemo": {
    resourceKey: "m736974652e666561747572657365766964656e63652e6d656574696e6773616e646163616c6c66726f6d74686564656d6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.n22octoberinyourownwordsmarked": {
    resourceKey: "m736974652e666561747572657365766964656e63652e6e32326f63746f626572696e796f75726f776e776f7264736d61726b6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.n6december840thewordsas": {
    resourceKey: "m736974652e666561747572657365766964656e63652e6e36646563656d626572383430746865776f7264736173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.n840thenamesiniteach": {
    resourceKey: "m736974652e666561747572657365766964656e63652e6e3834307468656e616d6573696e697465616368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.namesfromameetingeachwitha": {
    resourceKey: "m736974652e666561747572657365766964656e63652e6e616d657366726f6d616d656574696e67656163687769746861",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.nameskeptbesidethewords": {
    resourceKey: "m736974652e666561747572657365766964656e63652e6e616d65736b657074626573696465746865776f726473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.possiblenamesapossiblenameisstored": {
    resourceKey: "m736974652e666561747572657365766964656e63652e706f737369626c656e616d657361706f737369626c656e616d65697373746f726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.quoteswhenyourjournalquotesapassage": {
    resourceKey: "m736974652e666561747572657365766964656e63652e71756f7465737768656e796f75726a6f75726e616c71756f7465736170617373616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.seeitinajournal": {
    resourceKey: "m736974652e666561747572657365766964656e63652e7365656974696e616a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.thejournalssummaryofameeting": {
    resourceKey: "m736974652e666561747572657365766964656e63652e7468656a6f75726e616c7373756d6d6172796f66616d656574696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.thejournalssummaryoftheafternoon": {
    resourceKey: "m736974652e666561747572657365766964656e63652e7468656a6f75726e616c7373756d6d6172796f6674686561667465726e6f6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.thejournalssummarythethinkingyouchose": {
    resourceKey: "m736974652e666561747572657365766964656e63652e7468656a6f75726e616c7373756d6d6172797468657468696e6b696e67796f7563686f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.thesameeverywherethisallhappensin": {
    resourceKey: "m736974652e666561747572657365766964656e63652e74686573616d656576657279776865726574686973616c6c68617070656e73696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.whathappenedisdistinctfromwhatwas": {
    resourceKey: "m736974652e666561747572657365766964656e63652e7768617468617070656e6564697364697374696e637466726f6d77686174776173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.whathappenedisdistinctfromwhatwasx8c330011": {
    resourceKey: "m736974652e666561747572657365766964656e63652e7768617468617070656e6564697364697374696e637466726f6d77686174776173783863333330303131",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.whatwassaidwrittenbytranscriptionortaken": {
    resourceKey: "m736974652e666561747572657365766964656e63652e77686174776173736169647772697474656e62797472616e736372697074696f6e6f7274616b656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.whereanagentsnoteslive": {
    resourceKey: "m736974652e666561747572657365766964656e63652e7768657265616e6167656e74736e6f7465736c697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.whosaidityoursavedvoicefirstthen": {
    resourceKey: "m736974652e666561747572657365766964656e63652e77686f736169646974796f75727361766564766f69636566697273747468656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.whospokeyoursavedvoicefirstthen": {
    resourceKey: "m736974652e666561747572657365766964656e63652e77686f73706f6b65796f75727361766564766f69636566697273747468656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.yourcorrectionyou": {
    resourceKey: "m736974652e666561747572657365766964656e63652e796f7572636f7272656374696f6e796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.featuresevidence.yourjournalkeepstheaudiowhatit": {
    resourceKey: "m736974652e666561747572657365766964656e63652e796f75726a6f75726e616c6b65657073746865617564696f776861746974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.adaysactivitieswiththeafternoonofthe": {
    resourceKey: "m736974652e696e6465782e6164617973616374697669746965737769746874686561667465726e6f6f6e6f66746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.alwayslocal": {
    resourceKey: "m736974652e696e6465782e616c776179736c6f63616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.anotefromthefounder": {
    resourceKey: "m736974652e696e6465782e616e6f746566726f6d746865666f756e646572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.applewatch": {
    resourceKey: "m736974652e696e6465782e6170706c657761746368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.augustwasthewarmeststretchof": {
    resourceKey: "m736974652e696e6465782e6175677573747761737468657761726d657374737472657463686f66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.autumnandwinterbacktoletters": {
    resourceKey: "m736974652e696e6465782e617574756d6e616e6477696e7465726261636b746f6c657474657273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.awatercolorportraitofjeremie": {
    resourceKey: "m736974652e696e6465782e617761746572636f6c6f72706f7274726169746f666a6572656d6965",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.checkitsours": {
    resourceKey: "m736974652e696e6465782e636865636b6974736f757273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.howtheyearwent": {
    resourceKey: "m736974652e696e6465782e686f777468657965617277656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.howwerethingsbetweenanneandme": {
    resourceKey: "m736974652e696e6465782e686f77776572657468696e67736265747765656e616e6e65616e646d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.howyourjournalworks": {
    resourceKey: "m736974652e696e6465782e686f77796f75726a6f75726e616c776f726b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.howyourjournalworksin": {
    resourceKey: "m736974652e696e6465782e686f77796f75726a6f75726e616c776f726b73696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.itsearlysowhen": {
    resourceKey: "m736974652e696e6465782e6974736561726c79736f7768656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.jeremiemiller": {
    resourceKey: "m736974652e696e6465782e6a6572656d69656d696c6c6572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.n100opensource": {
    resourceKey: "m736974652e696e6465782e6e3130306f70656e736f75726365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.n1yourdays": {
    resourceKey: "m736974652e696e6465782e6e31796f757264617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.n2whatgoesin": {
    resourceKey: "m736974652e696e6465782e6e3277686174676f6573696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.n3youragents": {
    resourceKey: "m736974652e696e6465782e6e33796f75726167656e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.nextpart": {
    resourceKey: "m736974652e696e6465782e6e65787470617274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.oneachofyourown": {
    resourceKey: "m736974652e696e6465782e6f6e656163686f66796f75726f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.onlyyours": {
    resourceKey: "m736974652e696e6465782e6f6e6c79796f757273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.previouspart": {
    resourceKey: "m736974652e696e6465782e70726576696f757370617274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.readbackanydaywhat": {
    resourceKey: "m736974652e696e6465782e726561646261636b616e7964617977686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.readthecode": {
    resourceKey: "m736974652e696e6465782e72656164746865636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.shortanswersteadyandaffectionate": {
    resourceKey: "m736974652e696e6465782e73686f7274616e73776572737465616479616e64616666656374696f6e617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.solpbcacompanyofone": {
    resourceKey: "m736974652e696e6465782e736f6c70626361636f6d70616e796f666f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.solstoneisapersonaljournalplatformthe": {
    resourceKey: "m736974652e696e6465782e736f6c73746f6e65697361706572736f6e616c6a6f75726e616c706c6174666f726d746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.solstoneisapersonaljournalplatformwhat": {
    resourceKey: "m736974652e696e6465782e736f6c73746f6e65697361706572736f6e616c6a6f75726e616c706c6174666f726d77686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.solstoneisopensourceandfreeall": {
    resourceKey: "m736974652e696e6465782e736f6c73746f6e6569736f70656e736f75726365616e6466726565616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.solstoneonanandroidphone": {
    resourceKey: "m736974652e696e6465782e736f6c73746f6e656f6e616e616e64726f696470686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.solstoneonanapplewatch": {
    resourceKey: "m736974652e696e6465782e736f6c73746f6e656f6e616e6170706c657761746368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.solstoneonaniphonegoodafternoonaudio": {
    resourceKey: "m736974652e696e6465782e736f6c73746f6e656f6e616e6970686f6e65676f6f6461667465726e6f6f6e617564696f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.solstonethejournalyouve": {
    resourceKey: "m736974652e696e6465782e736f6c73746f6e657468656a6f75726e616c796f757665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.solstonethejournalyouve2": {
    resourceKey: "m736974652e696e6465782e736f6c73746f6e657468656a6f75726e616c796f75766532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.sotherewasnofightshewaspatient": {
    resourceKey: "m736974652e696e6465782e736f74686572657761736e6f666967687473686577617370617469656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.springvisitlatemarchtoapril8": {
    resourceKey: "m736974652e696e6465782e737072696e6776697369746c6174656d61726368746f617072696c38",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.summerthefirethenyouwalkedhome": {
    resourceKey: "m736974652e696e6465782e73756d6d6572746865666972657468656e796f7577616c6b6564686f6d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.theactivitypagewithclaudecodesfourteen": {
    resourceKey: "m736974652e696e6465782e74686561637469766974797061676577697468636c61756465636f646573666f75727465656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.thejournalyouvealways": {
    resourceKey: "m736974652e696e6465782e7468656a6f75726e616c796f757665616c77617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.thesolstoneapponeachdevicefrom": {
    resourceKey: "m736974652e696e6465782e746865736f6c73746f6e656170706f6e6561636864657669636566726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.thesolstonemenuona": {
    resourceKey: "m736974652e696e6465782e746865736f6c73746f6e656d656e756f6e61",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.thewholeansweraasitcameback": {
    resourceKey: "m736974652e696e6465782e74686577686f6c65616e73776572616173697463616d656261636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.weaskedclaudecodethisonceand": {
    resourceKey: "m736974652e696e6465782e776561736b6564636c61756465636f6465746869736f6e6365616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.whatgoesin": {
    resourceKey: "m736974652e696e6465782e77686174676f6573696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.whatyourjournalrecorded": {
    resourceKey: "m736974652e696e6465782e77686174796f75726a6f75726e616c7265636f72646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.whereitstoodatyearsend": {
    resourceKey: "m736974652e696e6465782e7768657265697473746f6f6461747965617273656e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.whethertheaugustletteractually": {
    resourceKey: "m736974652e696e6465782e776865746865727468656175677573746c657474657261637475616c6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.whetherthedecemberonewasever": {
    resourceKey: "m736974652e696e6465782e77686574686572746865646563656d6265726f6e6577617365766572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.winterlettersonlyherletterscame": {
    resourceKey: "m736974652e696e6465782e77696e7465726c6574746572736f6e6c796865726c65747465727363616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.youcansafelyletan": {
    resourceKey: "m736974652e696e6465782e796f7563616e736166656c796c6574616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.yourdays": {
    resourceKey: "m736974652e696e6465782e796f757264617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.yourdecember30draftfinallysays": {
    resourceKey: "m736974652e696e6465782e796f7572646563656d6265723330647261667466696e616c6c7973617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.yourdigitallifeshouldbelong": {
    resourceKey: "m736974652e696e6465782e796f75726469676974616c6c69666573686f756c6462656c6f6e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.index.yourowndevicesdothe": {
    resourceKey: "m736974652e696e6465782e796f75726f776e64657669636573646f746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.addthesignedrepositoryforyourdistribution": {
    resourceKey: "m736974652e696e7374616c6c2e6164647468657369676e65647265706f7369746f7279666f72796f7572646973747269627574696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.alreadyhaveoneaddthesolstoneapp": {
    resourceKey: "m736974652e696e7374616c6c2e616c7265616479686176656f6e65616464746865736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.alreadyhavesolstonefortmux": {
    resourceKey: "m736974652e696e7374616c6c2e616c726561647968617665736f6c73746f6e65666f72746d7578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.anapplesiliconmacm1ornewer": {
    resourceKey: "m736974652e696e7374616c6c2e616e6170706c6573696c69636f6e6d61636d316f726e65776572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.checkitsourstheinstallerchecks": {
    resourceKey: "m736974652e696e7374616c6c2e636865636b6974736f757273746865696e7374616c6c6572636865636b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.connecttoyourjournal": {
    resourceKey: "m736974652e696e7374616c6c2e636f6e6e656374746f796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.copycommands": {
    resourceKey: "m736974652e696e7374616c6c2e636f7079636f6d6d616e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.copyisunavailablehereselectthetext": {
    resourceKey: "m736974652e696e7374616c6c2e636f70796973756e617661696c61626c656865726573656c65637474686574657874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.getthejournalforwindows": {
    resourceKey: "m736974652e696e7374616c6c2e6765747468656a6f75726e616c666f7277696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.ifyouinstalledonlyonepackagerun": {
    resourceKey: "m736974652e696e7374616c6c2e6966796f75696e7374616c6c65646f6e6c796f6e657061636b61676572756e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.iosoripados26orlaterfree": {
    resourceKey: "m736974652e696e7374616c6c2e696f736f72697061646f7332366f726c6174657266726565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.journal": {
    resourceKey: "m736974652e696e7374616c6c2e6a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.journalanddesktopappx8664intel": {
    resourceKey: "m736974652e696e7374616c6c2e6a6f75726e616c616e646465736b746f706170707838363634696e74656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.journalapp": {
    resourceKey: "m736974652e696e7374616c6c2e6a6f75726e616c617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.ondebianorubuntu": {
    resourceKey: "m736974652e696e7374616c6c2e6f6e64656269616e6f727562756e7475",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.onfedoraorrhel": {
    resourceKey: "m736974652e696e7374616c6c2e6f6e6665646f72616f727268656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.onlinuxfromjournal2082": {
    resourceKey: "m736974652e696e7374616c6c2e6f6e6c696e757866726f6d6a6f75726e616c32303832",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.onopensuse": {
    resourceKey: "m736974652e696e7374616c6c2e6f6e6f70656e73757365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.openyourjournalthenopen": {
    resourceKey: "m736974652e696e7374616c6c2e6f70656e796f75726a6f75726e616c7468656e6f70656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.partofthesolstoneapp": {
    resourceKey: "m736974652e696e7374616c6c2e706172746f66746865736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.preferaptdnforzypper": {
    resourceKey: "m736974652e696e7374616c6c2e707265666572617074646e666f727a7970706572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.setupyourjournalonamac": {
    resourceKey: "m736974652e696e7374616c6c2e7365747570796f75726a6f75726e616c6f6e616d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.solstoneonyourphoneortablet": {
    resourceKey: "m736974652e696e7374616c6c2e736f6c73746f6e656f6e796f757270686f6e656f727461626c6574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.startajournal": {
    resourceKey: "m736974652e696e7374616c6c2e7374617274616a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.step1": {
    resourceKey: "m736974652e696e7374616c6c2e7374657031",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.step2": {
    resourceKey: "m736974652e696e7374616c6c2e7374657032",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.step3": {
    resourceKey: "m736974652e696e7374616c6c2e7374657033",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.step4": {
    resourceKey: "m736974652e696e7374616c6c2e7374657034",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.step5": {
    resourceKey: "m736974652e696e7374616c6c2e7374657035",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.step6": {
    resourceKey: "m736974652e696e7374616c6c2e7374657036",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.systempackagesputtheprogramsinusr": {
    resourceKey: "m736974652e696e7374616c6c2e73797374656d7061636b6167657370757474686570726f6772616d73696e757372",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.theinstallerverifiesreleaseswith": {
    resourceKey: "m736974652e696e7374616c6c2e746865696e7374616c6c6572766572696669657372656c656173657377697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.thejournalrunsonwindows1022h2": {
    resourceKey: "m736974652e696e7374616c6c2e7468656a6f75726e616c72756e736f6e77696e646f7773313032326832",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.thenopensolstonefromyour": {
    resourceKey: "m736974652e696e7374616c6c2e7468656e6f70656e736f6c73746f6e6566726f6d796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.thesolstoneappforlinux": {
    resourceKey: "m736974652e696e7374616c6c2e746865736f6c73746f6e65617070666f726c696e7578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.thesolstoneappformac": {
    resourceKey: "m736974652e696e7374616c6c2e746865736f6c73746f6e65617070666f726d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.install.turnonterminalinthe": {
    resourceKey: "m736974652e696e7374616c6c2e7475726e6f6e7465726d696e616c696e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.andcontainlibsodiumlicensenoticesarein": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e616e64636f6e7461696e6c6962736f6469756d6c6963656e73656e6f7469636573617265696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.minisign012unmodifiedlinuxbinariesfrom": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e6d696e697369676e303132756e6d6f6469666965646c696e757862696e617269657366726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.n1ad232c5a2e1ebbdad2cfbb86ad8fe7f73c7e4d4theexecutablesare": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e6e3161643233326335613265316562626461643263666262383661643866653766373363376534643474686565786563757461626c6573617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.releasearchiveminisign012linuxtar": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e72656c65617365617263686976656d696e697369676e3031326c696e7578746172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.releasesourcecommitb85e15d45ac9eab34e44596fd309f5b07db954": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e72656c65617365736f75726365636f6d6d69746238356531356434356163396561623334653434353936666433303966356230376462393534",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.rwqf6lrcga9i53mlyeco4izt51tgppvwucnsch1cbm0qtaln73y7gfo3": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e72777166366c72636761396935336d6c7965636f34697a74353174677070767775636e7363683163626d307174616c6e3733793767666f33",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.sha2569a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e7368613235363961353939623438626136656237623165383066313266333662393463656361376330306237613531373363393563336566633838",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.thearchivewasverifiedagainstminisign0": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e746865617263686976657761737665726966696564616761696e73746d696e697369676e30",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.theelfcompilermetadataidentifieszigbootstrap": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e746865656c66636f6d70696c65726d657461646174616964656e7469666965737a6967626f6f747374726170",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.installtoolsminisign012sourcetxt.theupstreamreleasekeyintheminisign": {
    resourceKey: "m736974652e696e7374616c6c746f6f6c736d696e697369676e303132736f757263657478742e746865757073747265616d72656c656173656b6579696e7468656d696e697369676e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.ahiddenactivityandwhatyourjournal": {
    resourceKey: "m736974652e696e746567726174652e6168696464656e6163746976697479616e6477686174796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.anyofthesekindstranscriptsmessagestransactions": {
    resourceKey: "m736974652e696e746567726174652e616e796f6674686573656b696e64737472616e736372697074736d657373616765737472616e73616374696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.aplainlistleavesoutsegmentsthat": {
    resourceKey: "m736974652e696e746567726174652e61706c61696e6c6973746c65617665736f75747365676d656e747374686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.aprofilepicthephotoyourjournalshows": {
    resourceKey: "m736974652e696e746567726174652e6170726f66696c6570696374686570686f746f796f75726a6f75726e616c73686f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.asignedinagentstays": {
    resourceKey: "m736974652e696e746567726174652e617369676e6564696e6167656e747374617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.audioclipsneedtranscriptsandits": {
    resourceKey: "m736974652e696e746567726174652e617564696f636c6970736e6565647472616e73637269707473616e64697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.cycleandpregnancyneedsbodyandits": {
    resourceKey: "m736974652e696e746567726174652e6379636c65616e64707265676e616e63796e65656473626f6479616e64697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.daydayfromdaytotimefromtimeto": {
    resourceKey: "m736974652e696e746567726174652e64617964617966726f6d646179746f74696d6566726f6d74696d65746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.designforitregisterand": {
    resourceKey: "m736974652e696e746567726174652e64657369676e666f7269747265676973746572616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.experiencesareyourjournalsthirdpersonaccounts": {
    resourceKey: "m736974652e696e746567726174652e657870657269656e636573617265796f75726a6f75726e616c737468697264706572736f6e6163636f756e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.facetswithtranscriptsorbody": {
    resourceKey: "m736974652e696e746567726174652e666163657473776974687472616e736372697074736f72626f6479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.fetchgettranscriptandgetactivitysourcesalso": {
    resourceKey: "m736974652e696e746567726174652e66657463686765747472616e736372697074616e646765746163746976697479736f7572636573616c736f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.forbodyincludegiveseachdaywhatyourjournalholds": {
    resourceKey: "m736974652e696e746567726174652e666f72626f6479696e636c75646567697665736561636864617977686174796f75726a6f75726e616c686f6c6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.forexampletheparamsofafew": {
    resourceKey: "m736974652e696e746567726174652e666f726578616d706c65746865706172616d736f6661666577",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.forpeopleincludelistsupto50aday": {
    resourceKey: "m736974652e696e746567726174652e666f7270656f706c65696e636c7564656c697374737570746f353061646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.forphotosincludelistsupto50aday": {
    resourceKey: "m736974652e696e746567726174652e666f7270686f746f73696e636c7564656c697374737570746f353061646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.forplacesincludelistsupto50aday": {
    resourceKey: "m736974652e696e746567726174652e666f72706c61636573696e636c7564656c697374737570746f353061646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.getweekwithdayfromanddaytoreadsa": {
    resourceKey: "m736974652e696e746567726174652e6765747765656b7769746864617966726f6d616e64646179746f726561647361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.itshouldfindtheoauthsignin": {
    resourceKey: "m736974652e696e746567726174652e697473686f756c6466696e647468656f617574687369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.journalreadstheagentsownnotes": {
    resourceKey: "m736974652e696e746567726174652e6a6f75726e616c72656164737468656167656e74736f776e6e6f746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.kindtargetvaluebasisreasonoperationid": {
    resourceKey: "m736974652e696e746567726174652e6b696e6474617267657476616c75656261736973726561736f6e6f7065726174696f6e6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.listactivitiesbydayorinclusivedate": {
    resourceKey: "m736974652e696e746567726174652e6c6973746163746976697469657362796461796f72696e636c757369766564617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.listactivitiesfiltersitsownrows": {
    resourceKey: "m736974652e696e746567726174652e6c6973746163746976697469657366696c746572736974736f776e726f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.listthepeopleprojectsandotherentities": {
    resourceKey: "m736974652e696e746567726174652e6c69737474686570656f706c6570726f6a65637473616e646f74686572656e746974696573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.listtranscriptsegmentswiththeirtimessources": {
    resourceKey: "m736974652e696e746567726174652e6c6973747472616e7363726970747365676d656e747377697468746865697274696d6573736f7572636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.loopbacklocalhostor127001": {
    resourceKey: "m736974652e696e746567726174652e6c6f6f706261636b6c6f63616c686f73746f72313237303031",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.makeapairingcodeforthatroute": {
    resourceKey: "m736974652e696e746567726174652e6d616b656170616972696e67636f6465666f7274686174726f757465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.mcp20250326overstreamablehttp": {
    resourceKey: "m736974652e696e746567726174652e6d637032303235303332366f76657273747265616d61626c6568747470",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.n5persigninattempt20from": {
    resourceKey: "m736974652e696e746567726174652e6e357065727369676e696e617474656d7074323066726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.nonetheownerpicksthegranton": {
    resourceKey: "m736974652e696e746567726174652e6e6f6e657468656f776e65727069636b737468656772616e746f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.onlytheagentsownnotesand": {
    resourceKey: "m736974652e696e746567726174652e6f6e6c797468656167656e74736f776e6e6f746573616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.peopleyoucorrespondedwithinmessagesoremail": {
    resourceKey: "m736974652e696e746567726174652e70656f706c65796f75636f72726573706f6e64656477697468696e6d657373616765736f72656d61696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.picturesfromfetchandgettranscript": {
    resourceKey: "m736974652e696e746567726174652e706963747572657366726f6d6665746368616e646765747472616e736372697074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.placeshasthreedetaillevels": {
    resourceKey: "m736974652e696e746567726174652e706c61636573686173746872656564657461696c6c6576656c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.postregisterdynamicclientregistrationora": {
    resourceKey: "m736974652e696e746567726174652e706f7374726567697374657264796e616d6963636c69656e74726567697374726174696f6e6f7261",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.posttokenauthorizationcodeandrefreshtoken": {
    resourceKey: "m736974652e696e746567726174652e706f7374746f6b656e617574686f72697a6174696f6e636f6465616e6472656672657368746f6b656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.readaweekdrawnfrom": {
    resourceKey: "m736974652e696e746567726174652e72656164617765656b647261776e66726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.readwhatthejournalhasnotedabout": {
    resourceKey: "m736974652e696e746567726174652e72656164776861747468656a6f75726e616c6861736e6f74656461626f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.readwhatwassaidinonesegment": {
    resourceKey: "m736974652e696e746567726174652e726561647768617477617373616964696e6f6e657365676d656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.saveanoteoftheagents": {
    resourceKey: "m736974652e696e746567726174652e73617665616e6f74656f667468656167656e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.screenshotsneedscreentextandits": {
    resourceKey: "m736974652e696e746567726174652e73637265656e73686f74736e65656473637265656e74657874616e64697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.searchandlisttranscriptssharethefindfilters": {
    resourceKey: "m736974652e696e746567726174652e736561726368616e646c6973747472616e73637269707473736861726574686566696e6466696c74657273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.signin": {
    resourceKey: "m736974652e696e746567726174652e7369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.signinpairingoauthredirects": {
    resourceKey: "m736974652e696e746567726174652e7369676e696e70616972696e676f61757468726564697265637473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.sometoolresultsincludealinkto": {
    resourceKey: "m736974652e696e746567726174652e736f6d65746f6f6c726573756c7473696e636c756465616c696e6b746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.suggestacorrectiontoarecordingwhat": {
    resourceKey: "m736974652e696e746567726174652e7375676765737461636f7272656374696f6e746f617265636f7264696e6777686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.suggestions": {
    resourceKey: "m736974652e696e746567726174652e73756767657374696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.theapprovalformpreselectsallfivekinds": {
    resourceKey: "m736974652e696e746567726174652e746865617070726f76616c666f726d70726573656c65637473616c6c666976656b696e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.thensignin": {
    resourceKey: "m736974652e696e746567726174652e7468656e7369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.thetargetmustbesomethingthisconnection": {
    resourceKey: "m736974652e696e746567726174652e7468657461726765746d7573746265736f6d657468696e6774686973636f6e6e656374696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.tocountamonthorayearinonecall": {
    resourceKey: "m736974652e696e746567726174652e746f636f756e74616d6f6e74686f726179656172696e6f6e6563616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.topointtoamomentina": {
    resourceKey: "m736974652e696e746567726174652e746f706f696e74746f616d6f6d656e74696e61",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.transcriptsfacetsscreentextorbodyeach": {
    resourceKey: "m736974652e696e746567726174652e7472616e7363726970747366616365747373637265656e746578746f72626f647965616368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.transcriptsorbodyeachsegmentstillneeds": {
    resourceKey: "m736974652e696e746567726174652e7472616e736372697074736f72626f6479656163687365676d656e747374696c6c6e65656473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.transcriptsscreentextorbody": {
    resourceKey: "m736974652e696e746567726174652e7472616e7363726970747373637265656e746578746f72626f6479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.weekanydayinityyyymmddor": {
    resourceKey: "m736974652e696e746567726174652e7765656b616e79646179696e6974797979796d6d64646f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.wellknownoauthprotectedresourcethenwell": {
    resourceKey: "m736974652e696e746567726174652e77656c6c6b6e6f776e6f6175746870726f7465637465647265736f757263657468656e77656c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.whenasourcepassagesaysuntimedthe": {
    resourceKey: "m736974652e696e746567726174652e7768656e61736f757263657061737361676573617973756e74696d6564746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.whensearchoralistreturnsnext": {
    resourceKey: "m736974652e696e746567726174652e7768656e7365617263686f72616c69737472657475726e736e657874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.workoutcoordinatesfollowplacesdetaillevel": {
    resourceKey: "m736974652e696e746567726174652e776f726b6f7574636f6f7264696e61746573666f6c6c6f77706c6163657364657461696c6c6576656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.youragentcansuggestacorrectionwhen": {
    resourceKey: "m736974652e696e746567726174652e796f75726167656e7463616e7375676765737461636f7272656374696f6e7768656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.yourclientsignsinthewaythe": {
    resourceKey: "m736974652e696e746567726174652e796f7572636c69656e747369676e73696e746865776179746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.integrate.yourwholejournaleverythingnowandanything": {
    resourceKey: "m736974652e696e746567726174652e796f757277686f6c656a6f75726e616c65766572797468696e676e6f77616e64616e797468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llms.docs": {
    resourceKey: "m736974652e6c6c6d732e646f6373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llms.optional": {
    resourceKey: "m736974652e6c6c6d732e6f7074696f6e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llms.theprojectismaintainedbysolpbc": {
    resourceKey: "m736974652e6c6c6d732e74686570726f6a65637469736d61696e7461696e65646279736f6c706263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llms.yourjournalholdstranscriptspeopleandprojects": {
    resourceKey: "m736974652e6c6c6d732e796f75726a6f75726e616c686f6c64737472616e7363726970747370656f706c65616e6470726f6a65637473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.agentruntimehttpsgithubcomsolpbcsolstone": {
    resourceKey: "m736974652e6c6c6d737478742e6167656e7472756e74696d656874747073676974687562636f6d736f6c706263736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.agentsconnecttoajournalfromthe": {
    resourceKey: "m736974652e6c6c6d737478742e6167656e7473636f6e6e656374746f616a6f75726e616c66726f6d746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.aiprovidershttpsgithubcomsolpbcsolstone": {
    resourceKey: "m736974652e6c6c6d737478742e616970726f7669646572736874747073676974687562636f6d736f6c706263736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.appdevelopmenthttpsgithubcomsolpbcsolstone": {
    resourceKey: "m736974652e6c6c6d737478742e617070646576656c6f706d656e746874747073676974687562636f6d736f6c706263736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.brandhttpssolstoneappbrandthesolstone": {
    resourceKey: "m736974652e6c6c6d737478742e6272616e646874747073736f6c73746f6e656170706272616e64746865736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.brandsystemhttpssolstoneappbrandsystem": {
    resourceKey: "m736974652e6c6c6d737478742e6272616e6473797374656d6874747073736f6c73746f6e656170706272616e6473797374656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.daygroundhttpssolstoneappbranddaygroundsolstone": {
    resourceKey: "m736974652e6c6c6d737478742e64617967726f756e646874747073736f6c73746f6e656170706272616e6464617967726f756e64736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.downloadshttpssolstoneappdownloadeverysolstone": {
    resourceKey: "m736974652e6c6c6d737478742e646f776e6c6f6164736874747073736f6c73746f6e65617070646f776e6c6f61646576657279736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.featureshttpssolstoneappfeatureswhatsolstone": {
    resourceKey: "m736974652e6c6c6d737478742e66656174757265736874747073736f6c73746f6e65617070666561747572657377686174736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.getstartedhttpssolstoneappinstallevery": {
    resourceKey: "m736974652e6c6c6d737478742e676574737461727465646874747073736f6c73746f6e65617070696e7374616c6c6576657279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.installguidehttpsgithubcomsolpbcsolstone": {
    resourceKey: "m736974652e6c6c6d737478742e696e7374616c6c67756964656874747073676974687562636f6d736f6c706263736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.integratehttpssolstoneappintegrateconnectingan": {
    resourceKey: "m736974652e6c6c6d737478742e696e746567726174656874747073736f6c73746f6e65617070696e74656772617465636f6e6e656374696e67616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.journalstructurehttpsgithubcomsolpbcsolstone": {
    resourceKey: "m736974652e6c6c6d737478742e6a6f75726e616c7374727563747572656874747073676974687562636f6d736f6c706263736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.messagebushttpsgithubcomsolpbcsolstone": {
    resourceKey: "m736974652e6c6c6d737478742e6d6573736167656275736874747073676974687562636f6d736f6c706263736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.oniphoneandipadiosoripados": {
    resourceKey: "m736974652e6c6c6d737478742e6f6e6970686f6e65616e6469706164696f736f72697061646f73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.readmehttpsgithubcomsolpbcsolstonejournal": {
    resourceKey: "m736974652e6c6c6d737478742e726561646d656874747073676974687562636f6d736f6c706263736f6c73746f6e656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.roadmaphttpsgithubcomsolpbcsolstonejournal": {
    resourceKey: "m736974652e6c6c6d737478742e726f61646d61706874747073676974687562636f6d736f6c706263736f6c73746f6e656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.solstoneisapersonaljournalplatformthe": {
    resourceKey: "m736974652e6c6c6d737478742e736f6c73746f6e65697361706572736f6e616c6a6f75726e616c706c6174666f726d746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.troubleshootinghttpsgithubcomsolpbcsolstonejournal": {
    resourceKey: "m736974652e6c6c6d737478742e74726f75626c6573686f6f74696e676874747073676974687562636f6d736f6c706263736f6c73746f6e656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.llmstxt.webinterfacehttpsgithubcomsolpbcsolstone": {
    resourceKey: "m736974652e6c6c6d737478742e776562696e746572666163656874747073676974687562636f6d736f6c706263736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.mobile.freeontheappstorewhereit": {
    resourceKey: "m736974652e6d6f62696c652e667265656f6e74686561707073746f726577686572656974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.mobile.getthesolstoneapponyourphone": {
    resourceKey: "m736974652e6d6f62696c652e676574746865736f6c73746f6e656170706f6e796f757270686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.mobile.solstoneisapersonaljournalplatformthe": {
    resourceKey: "m736974652e6d6f62696c652e736f6c73746f6e65697361706572736f6e616c6a6f75726e616c706c6174666f726d746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.mobile.solstoneonyourphoneortablet": {
    resourceKey: "m736974652e6d6f62696c652e736f6c73746f6e656f6e796f757270686f6e656f727461626c6574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.mobile.solstoneonyourphoneortabletiphone": {
    resourceKey: "m736974652e6d6f62696c652e736f6c73746f6e656f6e796f757270686f6e656f727461626c65746970686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.mobile.thesolstoneapponyourphoneor": {
    resourceKey: "m736974652e6d6f62696c652e746865736f6c73746f6e656170706f6e796f757270686f6e656f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.n404.brand": {
    resourceKey: "m736974652e6e3430342e6272616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.n404.features": {
    resourceKey: "m736974652e6e3430342e6665617475726573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.n404.mobile": {
    resourceKey: "m736974652e6e3430342e6d6f62696c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.page404.backtosolstoneapp": {
    resourceKey: "m736974652e706167653430342e6261636b746f736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.page404.everydownload": {
    resourceKey: "m736974652e706167653430342e6576657279646f776e6c6f6164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.page404.helpfullinks": {
    resourceKey: "m736974652e706167653430342e68656c7066756c6c696e6b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.page404.pagenotfound": {
    resourceKey: "m736974652e706167653430342e706167656e6f74666f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.page404.pagenotfoundsolstone": {
    resourceKey: "m736974652e706167653430342e706167656e6f74666f756e64736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.page404.thispagedoesntexisthereare": {
    resourceKey: "m736974652e706167653430342e7468697370616765646f65736e74657869737468657265617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.androidfromus": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e616e64726f696466726f6d7573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.architecture": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e617263686974656374757265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.bothmacapps": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e626f74686d616361707073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.checkit": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e636865636b6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.developershownassolpbc": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e646576656c6f70657273686f776e6173736f6c706263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.downloadsolstone": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e646f776e6c6f6164736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.everysolstonedownloadwithitsversionsize": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e6576657279736f6c73746f6e65646f776e6c6f61647769746869747376657273696f6e73697a65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.everysolstonedownloadwithitsversionsize2": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e6576657279736f6c73746f6e65646f776e6c6f61647769746869747376657273696f6e73697a6532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.holdseverythingthesolstoneapptakesin": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e686f6c647365766572797468696e67746865736f6c73746f6e6561707074616b6573696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.iphoneandipadappstoreandroidgoogle": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e6970686f6e65616e646970616461707073746f7265616e64726f6964676f6f676c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.keepsyourjournal": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e6b65657073796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.linux": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e6c696e7578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.mac": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e6d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.notshown": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e6e6f7473686f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.onediskimagewithboth": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e6f6e656469736b696d61676577697468626f7468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.platform": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e706c6174666f726d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.product": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e70726f64756374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.setup": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e7365747570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.signedbysolpbc": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e7369676e65646279736f6c706263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.signedbysolpbcnotarizedbyapple": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e7369676e65646279736f6c7062636e6f746172697a656462796170706c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.size": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e73697a65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.takesinwhatyoushare": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e74616b6573696e77686174796f757368617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.thejournal": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e7468656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.version": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e76657273696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.whatitdoes": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e776861746974646f6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.windows": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e77696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownload.x8664orarm64": {
    resourceKey: "m736974652e70616765646f776e6c6f61642e78383636346f7261726d3634",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.andonceitisinstalledoffthe": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e616e646f6e636569746973696e7374616c6c65646f6666746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.androidasks": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e616e64726f696461736b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.androidasksyouabouteachofthese": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e616e64726f696461736b73796f7561626f7574656163686f667468657365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.androidgrantsthesewhentheappinstalls": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e616e64726f69646772616e747374686573657768656e746865617070696e7374616c6c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.androidmakesanappdeclarewhatkind": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e616e64726f69646d616b6573616e6170706465636c617265776861746b696e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.checkthefileisours": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e636865636b74686566696c6569736f757273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.downloadthesolstoneappforandroid": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e646f776e6c6f6164746865736f6c73746f6e65617070666f72616e64726f6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.everyotherdevice": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e65766572796f74686572646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.everyreleaseonthispageissigned": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e657665727972656c656173656f6e746869737061676569737369676e6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.fetchthechecksumwepublishbesidethe": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e6665746368746865636865636b73756d77657075626c697368626573696465746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.ifyouhavetheandroidbuildtools": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e6966796f7568617665746865616e64726f69646275696c64746f6f6c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.ifyourphonehasgoogleplayservices": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e6966796f757270686f6e65686173676f6f676c65706c61797365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.nothingwhenyouopenittheapp": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e6e6f7468696e677768656e796f756f70656e6974746865617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.onadegoogledphonethereis": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e6f6e616465676f6f676c656470686f6e6574686572656973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.permission": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e7065726d697373696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.phoneswithoutgoogleplayservices": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e70686f6e6573776974686f7574676f6f676c65706c61797365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.playprotect": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e706c617970726f74656374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.soalargefileyouimportcan": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e736f616c6172676566696c65796f75696d706f727463616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.soaplacecansitalongsidewhat": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e736f61706c61636563616e736974616c6f6e677369646577686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.solstoneisongoogleplaythisis": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e736f6c73746f6e6569736f6e676f6f676c65706c6179746869736973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.sotheappcanremindyouafter": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e736f74686561707063616e72656d696e64796f756166746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.sotheappsowninternalmessages": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e736f746865617070736f776e696e7465726e616c6d65737361676573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.sotheongoingnoticestayswhereyou": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e736f7468656f6e676f696e676e6f7469636573746179737768657265796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.soyoucanseetheongoingnotice": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e736f796f7563616e7365657468656f6e676f696e676e6f74696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thatlistisreadoutofthe": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e746861746c6973746973726561646f75746f66746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thatprintsseveraldigestspersignerthe": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e746861747072696e74737365766572616c646967657374737065727369676e6572746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.theaudiosourcetakesinwhatyou": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e746865617564696f736f7572636574616b6573696e77686174796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thecalendarsourcereadstheeventsthis": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e74686563616c656e646172736f7572636572656164737468656576656e747374686973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thedigest": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e746865646967657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.theonesandroidgrantsatinstallwithout": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e7468656f6e6573616e64726f69646772616e74736174696e7374616c6c776974686f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thequotedwordsbelowareandroids": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e74686571756f746564776f72647362656c6f77617265616e64726f696473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thereisnoanalyticsortrackingcode": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e746865726569736e6f616e616c79746963736f72747261636b696e67636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thescreensourceisntonthat": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e74686573637265656e736f7572636569736e746f6e74686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thesignedsolstoneappforandroidstraight": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e7468657369676e6564736f6c73746f6e65617070666f72616e64726f69647374726169676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thesigningcertificate": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e7468657369676e696e676365727469666963617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thetwobuttonsarescanappand": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e74686574776f627574746f6e736172657363616e617070616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.thistakesacomputerdownloadthefile": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e7468697374616b657361636f6d7075746572646f776e6c6f616474686566696c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.tofinishapieceofworkrather": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e746f66696e6973686170696563656f66776f726b726174686572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.toreachthejournalyoupairedwith": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e746f72656163687468656a6f75726e616c796f7570616972656477697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.turnusbdebuggingbackoffwhenyou": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e7475726e757362646562756767696e676261636b6f66667768656e796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.twothingsuseitthecamerasource": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e74776f7468696e6773757365697474686563616d657261736f75726365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.updatesthiscopydoesnotupdateitself": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e7570646174657374686973636f7079646f65736e6f74757064617465697473656c66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.whatitisfor": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e7768617469746973666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.whattheappasksyoufor": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e7768617474686561707061736b73796f75666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.whatyouwillbeasked": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e77686174796f7577696c6c626561736b6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadandroid.youdonothavetotakeour": {
    resourceKey: "m736974652e70616765646f776e6c6f6164616e64726f69642e796f75646f6e6f7468617665746f74616b656f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.alreadyhavethejournalapp": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e616c7265616479686176657468656a6f75726e616c617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.applesiliconm1ornewermacos15": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e6170706c6573696c69636f6e6d316f726e657765726d61636f733135",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.downloadthejournalappformac": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e646f776e6c6f61647468656a6f75726e616c617070666f726d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.downloadthejournalforapplesiliconmacs": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e646f776e6c6f61647468656a6f75726e616c666f726170706c6573696c69636f6e6d616373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.justthesolstoneapp": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e6a757374746865736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.openthejournalappandchooseupdates": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e6f70656e7468656a6f75726e616c617070616e6463686f6f736575706461746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.thejournalisthememoryitsown": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e7468656a6f75726e616c69737468656d656d6f72796974736f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.thejournalisunavailablewhiletheapp": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e7468656a6f75726e616c6973756e617661696c61626c657768696c65746865617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.thisisthejournalappwhereyour": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e7468697369737468656a6f75726e616c6170707768657265796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournal.toinstallthisdownloadmanuallyquitthe": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c2e746f696e7374616c6c74686973646f776e6c6f61646d616e75616c6c7971756974746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.afteritinstalls": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e61667465726974696e7374616c6c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.afteritinstallssolstonejournalsetupin": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e61667465726974696e7374616c6c73736f6c73746f6e656a6f75726e616c7365747570696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.beforeyoudownload": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e6265666f7265796f75646f776e6c6f6164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.choosecontinueinthesolstoneappits": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e63686f6f7365636f6e74696e7565696e746865736f6c73746f6e65617070697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.followthesourcestepsinthesolstone": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e666f6c6c6f77746865736f757263657374657073696e746865736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.localthinkingneedsacompatiblegpuon": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e6c6f63616c7468696e6b696e676e6565647361636f6d70617469626c656770756f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.noadministratoraccessneeded": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e6e6f61646d696e6973747261746f726163636573736e6565646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.openjournalfromthestartmenufollow": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e6f70656e6a6f75726e616c66726f6d74686573746172746d656e75666f6c6c6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.prefertheterminal": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e7072656665727468657465726d696e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.setuphelp": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e736574757068656c70",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.signedbysolpbcwindowsshowssol": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e7369676e65646279736f6c70626377696e646f777373686f7773736f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.thejournalforwindows": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e7468656a6f75726e616c666f7277696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.thejournalforwindowssolstone": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e7468656a6f75726e616c666f7277696e646f7773736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.whatsnew": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e77686174736e6577",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.windows1022h2or11onan": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e77696e646f77733130323268326f7231316f6e616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadjournalwindows.yourjournalonawindowspcyou": {
    resourceKey: "m736974652e70616765646f776e6c6f61646a6f75726e616c77696e646f77732e796f75726a6f75726e616c6f6e6177696e646f77737063796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.afteryouopenthedownload": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e6166746572796f756f70656e746865646f776e6c6f6164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.bothmacappsonedownload": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e626f74686d6163617070736f6e65646f776e6c6f6164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.bothmacappsonedownloadsolstone": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e626f74686d6163617070736f6e65646f776e6c6f6164736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.comingbackforoneapponits": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e636f6d696e676261636b666f726f6e656170706f6e697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.downloadbothformac": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e646f776e6c6f6164626f7468666f726d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.downloadthestandalonejournalapp": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e646f776e6c6f61647468657374616e64616c6f6e656a6f75726e616c617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.downloadthestandalonesolstoneapp": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e646f776e6c6f61647468657374616e64616c6f6e65736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.experiences": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e657870657269656e636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.installbothappsthenopeneitherone": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e696e7374616c6c626f7468617070737468656e6f70656e6569746865726f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.justoneofthem": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e6a7573746f6e656f667468656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.keepsyourjournalonyourmac": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e6b65657073796f75726a6f75726e616c6f6e796f75726d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.onecommandeitherapporboth": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e6f6e65636f6d6d616e646569746865726170706f72626f7468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.onedownloadtwoappsthesolstoneapp": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e6f6e65646f776e6c6f616474776f61707073746865736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.onedownloadtwoappsthesolstoneapp2": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e6f6e65646f776e6c6f616474776f61707073746865736f6c73746f6e6561707032",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.remembers": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e72656d656d62657273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.runsinyourmenubarwhatyou": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e72756e73696e796f75726d656e7562617277686174796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.settingupajournalonamac": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e73657474696e677570616a6f75726e616c6f6e616d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.thejournalapp": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e7468656a6f75726e616c617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.thejournalapponly": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e7468656a6f75726e616c6170706f6e6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.thesimplesetupisbothonone": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e74686573696d706c6573657475706973626f74686f6e6f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.thesolstoneapp": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e746865736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.thesolstoneapponly": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e746865736f6c73746f6e656170706f6e6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.thesolstoneapptakesinwhatyou": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e746865736f6c73746f6e6561707074616b6573696e77686174796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.useinstallsh": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e757365696e7374616c6c7368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.youliveintheterminaloryour": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e796f756c697665696e7468657465726d696e616c6f72796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmac.yourjournalalreadylivesonanothermachine": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61632e796f75726a6f75726e616c616c72656164796c697665736f6e616e6f746865726d616368696e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmacos.downloadthesolstoneappforapplesilicon": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61636f732e646f776e6c6f6164746865736f6c73746f6e65617070666f726170706c6573696c69636f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmacos.downloadthesolstoneappformac": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61636f732e646f776e6c6f6164746865736f6c73746f6e65617070666f726d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmacos.thesolstoneapptakesinwhatyou": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61636f732e746865736f6c73746f6e6561707074616b6573696e77686174796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadmacos.thesolstoneapptakesinwhatyou2": {
    resourceKey: "m736974652e70616765646f776e6c6f61646d61636f732e746865736f6c73746f6e6561707074616b6573696e77686174796f7532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.alreadyusingthesolstoneappupdatingkeeps": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e616c72656164797573696e67746865736f6c73746f6e656170707570646174696e676b65657073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.chooseyoursources": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e63686f6f7365796f7572736f7572636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.connectyourjournal": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e636f6e6e656374796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.downloadthesolstoneappforwindows": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e646f776e6c6f6164746865736f6c73746f6e65617070666f7277696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.downloadthesolstoneappforwindowschoose": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e646f776e6c6f6164746865736f6c73746f6e65617070666f7277696e646f777363686f6f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.ifyoucontinuedfromthejournalwindow": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e6966796f75636f6e74696e75656466726f6d7468656a6f75726e616c77696e646f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.onanarm64pcwindows11runs": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e6f6e616e61726d3634706377696e646f7773313172756e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.opentheinstallerthenfollowthesteps": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e6f70656e746865696e7374616c6c65727468656e666f6c6c6f777468657374657073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.signedbysolpbcwhileoursigning": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e7369676e65646279736f6c7062637768696c656f75727369676e696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.thesolstoneapptakesinwhatyou": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e746865736f6c73746f6e6561707074616b6573696e77686174796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagedownloadwindows.windows1022h2or11x64": {
    resourceKey: "m736974652e70616765646f776e6c6f616477696e646f77732e77696e646f77733130323268326f723131783634",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.acopyofyourjournalencryptedbefore": {
    resourceKey: "m736974652e70616765696e6465782e61636f70796f66796f75726a6f75726e616c656e637279707465646265666f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.adailybriefing": {
    resourceKey: "m736974652e70616765696e6465782e616461696c796272696566696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.alocalconnectionforanyagentthat": {
    resourceKey: "m736974652e70616765696e6465782e616c6f63616c636f6e6e656374696f6e666f72616e796167656e7474686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.alookbackatyesterdaywrittenfrom": {
    resourceKey: "m736974652e70616765696e6465782e616c6f6f6b6261636b61747965737465726461797772697474656e66726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.anaddressforyourjournalsoan": {
    resourceKey: "m736974652e70616765696e6465782e616e61646472657373666f72796f75726a6f75726e616c736f616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.answered": {
    resourceKey: "m736974652e70616765696e6465782e616e737765726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.asked": {
    resourceKey: "m736974652e70616765696e6465782e61736b6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.confidentialprocessing96yr": {
    resourceKey: "m736974652e70616765696e6465782e636f6e666964656e7469616c70726f63657373696e6739367972",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.connectyouragent": {
    resourceKey: "m736974652e70616765696e6465782e636f6e6e656374796f75726167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.encryptedbackup48yr": {
    resourceKey: "m736974652e70616765696e6465782e656e637279707465646261636b757034387972",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.freeandopensourceyourjournallives": {
    resourceKey: "m736974652e70616765696e6465782e66726565616e646f70656e736f75726365796f75726a6f75726e616c6c69766573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.fromanywhere": {
    resourceKey: "m736974652e70616765696e6465782e66726f6d616e797768657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.fromthecommandlineorfromyour": {
    resourceKey: "m736974652e70616765696e6465782e66726f6d746865636f6d6d616e646c696e656f7266726f6d796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.onthesamecomputer": {
    resourceKey: "m736974652e70616765696e6465782e6f6e74686573616d65636f6d7075746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.onyourcomputerbydefaultonceyou": {
    resourceKey: "m736974652e70616765696e6465782e6f6e796f7572636f6d7075746572627964656661756c746f6e6365796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.optionalservices": {
    resourceKey: "m736974652e70616765696e6465782e6f7074696f6e616c7365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.oryourownamodelonyour": {
    resourceKey: "m736974652e70616765696e6465782e6f72796f75726f776e616d6f64656c6f6e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.oryourownanystoragebucketyou": {
    resourceKey: "m736974652e70616765696e6465782e6f72796f75726f776e616e7973746f726167656275636b6574796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.oryourownatunnelthatonly": {
    resourceKey: "m736974652e70616765696e6465782e6f72796f75726f776e6174756e6e656c746861746f6e6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.oryourownyourwifioryour": {
    resourceKey: "m736974652e70616765696e6465782e6f72796f75726f776e796f7572776966696f72796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.pairanagentwithacodefrom": {
    resourceKey: "m736974652e70616765696e6465782e70616972616e6167656e747769746861636f646566726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.privatenetwork20yr": {
    resourceKey: "m736974652e70616765696e6465782e707269766174656e6574776f726b32307972",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.publicbenefitcorporationdedicatedtodigitalself": {
    resourceKey: "m736974652e70616765696e6465782e7075626c696362656e65666974636f72706f726174696f6e646564696361746564746f6469676974616c73656c66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.reachyourjournalfromyourphonefrom": {
    resourceKey: "m736974652e70616765696e6465782e7265616368796f75726a6f75726e616c66726f6d796f757270686f6e6566726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.rememberedacrossdayswiththemomentsthat": {
    resourceKey: "m736974652e70616765696e6465782e72656d656d62657265646163726f737364617973776974687468656d6f6d656e747374686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.searchacrossallofit": {
    resourceKey: "m736974652e70616765696e6465782e7365617263686163726f7373616c6c6f666974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.seetheservices": {
    resourceKey: "m736974652e70616765696e6465782e7365657468657365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.solpbccantsellorlicense": {
    resourceKey: "m736974652e70616765696e6465782e736f6c70626363616e7473656c6c6f726c6963656e7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.solpbcrunsafewservicesif": {
    resourceKey: "m736974652e70616765696e6465782e736f6c70626372756e736166657773657276696365736966",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.solstoneme5yr": {
    resourceKey: "m736974652e70616765696e6465782e736f6c73746f6e656d65357972",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.theagentsyoualreadyusecanwork": {
    resourceKey: "m736974652e70616765696e6465782e7468656167656e7473796f75616c726561647975736563616e776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.thepeopleandprojectsinyourdays": {
    resourceKey: "m736974652e70616765696e6465782e74686570656f706c65616e6470726f6a65637473696e796f757264617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.theresnotelemetrynoanalyticsvendor": {
    resourceKey: "m736974652e70616765696e6465782e7468657265736e6f74656c656d657472796e6f616e616c797469637376656e646f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.thinkingoffyourdeviceonconfidentialhardware": {
    resourceKey: "m736974652e70616765696e6465782e7468696e6b696e676f6666796f75726465766963656f6e636f6e666964656e7469616c6861726477617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.throughatunnelofyourownor": {
    resourceKey: "m736974652e70616765696e6465782e7468726f7567686174756e6e656c6f66796f75726f776e6f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.whatyouget": {
    resourceKey: "m736974652e70616765696e6465782e77686174796f75676574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.whatyouragentsget": {
    resourceKey: "m736974652e70616765696e6465782e77686174796f75726167656e7473676574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.youdonthavetotakeour": {
    resourceKey: "m736974652e70616765696e6465782e796f75646f6e7468617665746f74616b656f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.yourjournalkeepstheoriginalsinopen": {
    resourceKey: "m736974652e70616765696e6465782e796f75726a6f75726e616c6b656570737468656f726967696e616c73696e6f70656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.yourmeetingstranscribed": {
    resourceKey: "m736974652e70616765696e6465782e796f75726d656574696e67737472616e73637269626564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.yoursbystructure": {
    resourceKey: "m736974652e70616765696e6465782e796f7572736279737472756374757265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageindex.yoursbystructureandopensource": {
    resourceKey: "m736974652e70616765696e6465782e796f7572736279737472756374757265616e646f70656e736f75726365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.addthedesktopapp": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6164647468656465736b746f70617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.addyourjournaltoyouragentwith": {
    resourceKey: "m736974652e70616765696e7374616c6c2e616464796f75726a6f75726e616c746f796f75726167656e7477697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.afterconnectingchooseopenyourjournalin": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6166746572636f6e6e656374696e6763686f6f73656f70656e796f75726a6f75726e616c696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.afterupdatingreopenyourjournalandcheck": {
    resourceKey: "m736974652e70616765696e7374616c6c2e61667465727570646174696e6772656f70656e796f75726a6f75726e616c616e64636865636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.amodeldownloadsandrunsonyour": {
    resourceKey: "m736974652e70616765696e7374616c6c2e616d6f64656c646f776e6c6f616473616e6472756e736f6e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.android": {
    resourceKey: "m736974652e70616765696e7374616c6c2e616e64726f6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.android80orlaterfreeon": {
    resourceKey: "m736974652e70616765696e7374616c6c2e616e64726f696438306f726c61746572667265656f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.anyagentthatspeaksmcpcanconnect": {
    resourceKey: "m736974652e70616765696e7374616c6c2e616e796167656e7474686174737065616b736d637063616e636f6e6e656374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.bringyourownproviderkeyclaudegemini": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6272696e67796f75726f776e70726f76696465726b6579636c6175646567656d696e69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.checkitsoursbothmacapps": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636865636b6974736f757273626f74686d616361707073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.checkitsoursgoogleplaylists": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636865636b6974736f757273676f6f676c65706c61796c69737473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.checkitsourstheappstore": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636865636b6974736f75727374686561707073746f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.checkitsoursthejournalinstaller": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636865636b6974736f7572737468656a6f75726e616c696e7374616c6c6572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.chooseconnectanagentthenonthis": {
    resourceKey: "m736974652e70616765696e7374616c6c2e63686f6f7365636f6e6e656374616e6167656e747468656e6f6e74686973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.chooseitsfolderchooseitspermanentmark": {
    resourceKey: "m736974652e70616765696e7374616c6c2e63686f6f7365697473666f6c64657263686f6f73656974737065726d616e656e746d61726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.choosethecomputeryourjournalwilllive": {
    resourceKey: "m736974652e70616765696e7374616c6c2e63686f6f7365746865636f6d7075746572796f75726a6f75726e616c77696c6c6c697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.choosethedeviceyoureaddingit": {
    resourceKey: "m736974652e70616765696e7374616c6c2e63686f6f7365746865646576696365796f757265616464696e676974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.choosewhattoshare": {
    resourceKey: "m736974652e70616765696e7374616c6c2e63686f6f736577686174746f7368617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.choosewhatyoushare": {
    resourceKey: "m736974652e70616765696e7374616c6c2e63686f6f736577686174796f757368617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.chooseyourplatform": {
    resourceKey: "m736974652e70616765696e7374616c6c2e63686f6f7365796f7572706c6174666f726d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.confidentialprocessing": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.connecttheapptoajournalon": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636f6e6e656374746865617070746f616a6f75726e616c6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.connectthesolstoneapp": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636f6e6e656374746865736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.connectyouragent": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636f6e6e656374796f75726167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.copiedtoclipboard": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636f70696564746f636c6970626f617264",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.copycommand": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636f7079636f6d6d616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.copyforyouragent": {
    resourceKey: "m736974652e70616765696e7374616c6c2e636f7079666f72796f75726167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.day1": {
    resourceKey: "m736974652e70616765696e7374616c6c2e64617931",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.day1andtomorrowmorning": {
    resourceKey: "m736974652e70616765696e7374616c6c2e64617931616e64746f6d6f72726f776d6f726e696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.dontseeyourplatformtellus": {
    resourceKey: "m736974652e70616765696e7374616c6c2e646f6e74736565796f7572706c6174666f726d74656c6c7573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.downloadandrunthejournalinstallerthen": {
    resourceKey: "m736974652e70616765696e7374616c6c2e646f776e6c6f6164616e6472756e7468656a6f75726e616c696e7374616c6c65727468656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.downloadontheappstore": {
    resourceKey: "m736974652e70616765696e7374616c6c2e646f776e6c6f61646f6e74686561707073746f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.forjustonereplaceallwithjournal": {
    resourceKey: "m736974652e70616765696e7374616c6c2e666f726a7573746f6e657265706c616365616c6c776974686a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.fromyourterminal": {
    resourceKey: "m736974652e70616765696e7374616c6c2e66726f6d796f75727465726d696e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.getbothmacapps": {
    resourceKey: "m736974652e70616765696e7374616c6c2e676574626f74686d616361707073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.getitongoogleplay": {
    resourceKey: "m736974652e70616765696e7374616c6c2e67657469746f6e676f6f676c65706c6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.getstartedwithsolstone": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6765747374617274656477697468736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.getstartedwithsolstonethesolstoneapp": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6765747374617274656477697468736f6c73746f6e65746865736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.getthesolstoneapp": {
    resourceKey: "m736974652e70616765696e7374616c6c2e676574746865736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.getthewindowsapp": {
    resourceKey: "m736974652e70616765696e7374616c6c2e67657474686577696e646f7773617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.getthewindowsappbelowopenits": {
    resourceKey: "m736974652e70616765696e7374616c6c2e67657474686577696e646f777361707062656c6f776f70656e697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.howareyoustarting": {
    resourceKey: "m736974652e70616765696e7374616c6c2e686f77617265796f757374617274696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.howsolstonemeworks": {
    resourceKey: "m736974652e70616765696e7374616c6c2e686f77736f6c73746f6e656d65776f726b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.install": {
    resourceKey: "m736974652e70616765696e7374616c6c2e696e7374616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.installandopenthesolstoneappin": {
    resourceKey: "m736974652e70616765696e7374616c6c2e696e7374616c6c616e646f70656e746865736f6c73746f6e65617070696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.installbothapps": {
    resourceKey: "m736974652e70616765696e7374616c6c2e696e7374616c6c626f746861707073",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.installbothmacappswithonecommand": {
    resourceKey: "m736974652e70616765696e7374616c6c2e696e7374616c6c626f74686d616361707073776974686f6e65636f6d6d616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.installedthejournalfromtheterminalbefore": {
    resourceKey: "m736974652e70616765696e7374616c6c2e696e7374616c6c65647468656a6f75726e616c66726f6d7468657465726d696e616c6265666f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.installthejournalappthenopenit": {
    resourceKey: "m736974652e70616765696e7374616c6c2e696e7374616c6c7468656a6f75726e616c6170707468656e6f70656e6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.inthejournalwindowchoosecontinuein": {
    resourceKey: "m736974652e70616765696e7374616c6c2e696e7468656a6f75726e616c77696e646f7763686f6f7365636f6e74696e7565696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.inthesolstoneappssettingschoose": {
    resourceKey: "m736974652e70616765696e7374616c6c2e696e746865736f6c73746f6e656170707373657474696e677363686f6f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.inyourjournalopennetworkandchoose": {
    resourceKey: "m736974652e70616765696e7374616c6c2e696e796f75726a6f75726e616c6f70656e6e6574776f726b616e6463686f6f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.iphoneandipad": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6970686f6e65616e6469706164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.iphoneipad": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6970686f6e6569706164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.journalonanothercomputer": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6a6f75726e616c6f6e616e6f74686572636f6d7075746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.localthedefault": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6c6f63616c74686564656661756c74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.makeyourjournalyours": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6d616b65796f75726a6f75726e616c796f757273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.microphonesystemaudioandscreenstartoff": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6d6963726f70686f6e6573797374656d617564696f616e6473637265656e73746172746f6666",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.moreaboutsolstoneme": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6d6f726561626f7574736f6c73746f6e656d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.nogoogleplaygetitfromus": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6e6f676f6f676c65706c6179676574697466726f6d7573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onamacoronwindowswith": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e616d61636f726f6e77696e646f777377697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.oncethesolstoneappconnectsopenyour": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e6365746865736f6c73746f6e65617070636f6e6e656374736f70656e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onesetupsequencetakesyouthroughboth": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e65736574757073657175656e636574616b6573796f757468726f756768626f7468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onlinuxsettingupyourjournaladds": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e6c696e757873657474696e677570796f75726a6f75726e616c61646473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onmacopenthejournalappand": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e6d61636f70656e7468656a6f75726e616c617070616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onwindowsopenjournalfromthestart": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e77696e646f77736f70656e6a6f75726e616c66726f6d7468657374617274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onyourandroidphone": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e796f7572616e64726f696470686f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onyouriphoneoripad": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e796f75726970686f6e656f7269706164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onyourlinuxcomputer": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e796f75726c696e7578636f6d7075746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onyourmac": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e796f75726d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.onyourwindowscomputer": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f6e796f757277696e646f7773636f6d7075746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.openeitherapp": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f70656e656974686572617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.openthedownloadanddragthesolstone": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f70656e746865646f776e6c6f6164616e6464726167746865736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.openyourjournal": {
    resourceKey: "m736974652e70616765696e7374616c6c2e6f70656e796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.pairaphoneifyoulike": {
    resourceKey: "m736974652e70616765696e7374616c6c2e706169726170686f6e656966796f756c696b65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.pastethisintoclaudecodecodexcli": {
    resourceKey: "m736974652e70616765696e7374616c6c2e706173746574686973696e746f636c61756465636f6465636f646578636c69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.prefertoinstallwithacodingagent": {
    resourceKey: "m736974652e70616765696e7374616c6c2e707265666572746f696e7374616c6c7769746861636f64696e676167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.runthiscommandinyourterminalit": {
    resourceKey: "m736974652e70616765696e7374616c6c2e72756e74686973636f6d6d616e64696e796f75727465726d696e616c6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.setupofferslocalthinkingfirstwhenyour": {
    resourceKey: "m736974652e70616765696e7374616c6c2e73657475706f66666572736c6f63616c7468696e6b696e6766697273747768656e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.setupyourjournal": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7365747570796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.thedailybriefingforday1is": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7468656461696c796272696566696e67666f72646179316973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.thefullreferenceforconnectinganagent": {
    resourceKey: "m736974652e70616765696e7374616c6c2e74686566756c6c7265666572656e6365666f72636f6e6e656374696e67616e6167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.theinstalleropenssetupinyourbrowser": {
    resourceKey: "m736974652e70616765696e7374616c6c2e746865696e7374616c6c65726f70656e737365747570696e796f757262726f77736572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.themicrophoneandyourlocationeachwhen": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7468656d6963726f70686f6e65616e64796f75726c6f636174696f6e656163687768656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.themicrophoneandyourlocationeachwhen2": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7468656d6963726f70686f6e65616e64796f75726c6f636174696f6e656163687768656e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.themicrophoneforaudioandscreensystem": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7468656d6963726f70686f6e65666f72617564696f616e6473637265656e73797374656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.thentypemcpinclaudecodechoose": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7468656e747970656d6370696e636c61756465636f646563686f6f7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.thesolstoneapptakesinwhatyou": {
    resourceKey: "m736974652e70616765696e7374616c6c2e746865736f6c73746f6e6561707074616b6573696e77686174796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.thewindowsappisbuiltforx64": {
    resourceKey: "m736974652e70616765696e7374616c6c2e74686577696e646f777361707069736275696c74666f72783634",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.thinkoffyourdeviceonconfidentialhardware": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7468696e6b6f6666796f75726465766963656f6e636f6e666964656e7469616c6861726477617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.tmux": {
    resourceKey: "m736974652e70616765696e7374616c6c2e746d7578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.tomorrowmorning": {
    resourceKey: "m736974652e70616765696e7374616c6c2e746f6d6f72726f776d6f726e696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.turnitoninyourjournals": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7475726e69746f6e696e796f75726a6f75726e616c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.turnonsolstonemeanaddressfor": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7475726e6f6e736f6c73746f6e656d65616e61646472657373666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.turnonyourmicrophoneandscreenone": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7475726e6f6e796f75726d6963726f70686f6e65616e6473637265656e6f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.updatethejournalonthecomputerthat": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7570646174657468656a6f75726e616c6f6e746865636f6d707574657274686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.updatingyourjournal": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7570646174696e67796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.whatyourdevicewillask": {
    resourceKey: "m736974652e70616765696e7374616c6c2e77686174796f757264657669636577696c6c61736b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.whatyousharegoesintoyourjournal": {
    resourceKey: "m736974652e70616765696e7374616c6c2e77686174796f757368617265676f6573696e746f796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.whatyousharewiththesolstoneapp": {
    resourceKey: "m736974652e70616765696e7374616c6c2e77686174796f75736861726577697468746865736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.whenyoucontinuefromthejournalwindow": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7768656e796f75636f6e74696e756566726f6d7468656a6f75726e616c77696e646f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.wheredoesthethinkinghappen": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7768657265646f65737468657468696e6b696e6768617070656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.whileoursigningreputationbuildswindowsmay": {
    resourceKey: "m736974652e70616765696e7374616c6c2e7768696c656f75727369676e696e6772657075746174696f6e6275696c647377696e646f77736d6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.withaudioonthevoicesofpeople": {
    resourceKey: "m736974652e70616765696e7374616c6c2e77697468617564696f6f6e746865766f696365736f6670656f706c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.youcanpauseanysourceorturn": {
    resourceKey: "m736974652e70616765696e7374616c6c2e796f7563616e7061757365616e79736f757263656f727475726e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.yourbrowseropensyourjournalspage": {
    resourceKey: "m736974652e70616765696e7374616c6c2e796f757262726f777365726f70656e73796f75726a6f75726e616c7370616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.yourdesktopaskswhichscreentoshare": {
    resourceKey: "m736974652e70616765696e7374616c6c2e796f75726465736b746f7061736b73776869636873637265656e746f7368617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.yourjournalsagentsappworkswith": {
    resourceKey: "m736974652e70616765696e7374616c6c2e796f75726a6f75726e616c736167656e7473617070776f726b7377697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.yourjournalworksfromyourcomputeralone": {
    resourceKey: "m736974652e70616765696e7374616c6c2e796f75726a6f75726e616c776f726b7366726f6d796f7572636f6d7075746572616c6f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageinstall.yourownmodel": {
    resourceKey: "m736974652e70616765696e7374616c6c2e796f75726f776e6d6f64656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.addacustomconnectorinclaudes": {
    resourceKey: "m736974652e70616765696e746567726174652e61646461637573746f6d636f6e6e6563746f72696e636c6175646573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.addanhttpserverattheaddress": {
    resourceKey: "m736974652e70616765696e746567726174652e616464616e68747470736572766572617474686561646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.addit": {
    resourceKey: "m736974652e70616765696e746567726174652e6164646974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.address": {
    resourceKey: "m736974652e70616765696e746567726174652e61646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.addtheaddresstoyouragent": {
    resourceKey: "m736974652e70616765696e746567726174652e61646474686561646472657373746f796f75726167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.agent": {
    resourceKey: "m736974652e70616765696e746567726174652e6167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.alwaysoneveryconnectioncansavenotes": {
    resourceKey: "m736974652e70616765696e746567726174652e616c776179736f6e6576657279636f6e6e656374696f6e63616e736176656e6f746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.amodelcontextprotocolserverinsideyour": {
    resourceKey: "m736974652e70616765696e746567726174652e616d6f64656c636f6e7465787470726f746f636f6c736572766572696e73696465796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.anapporagentotherpeopleinstall": {
    resourceKey: "m736974652e70616765696e746567726174652e616e6170706f726167656e746f7468657270656f706c65696e7374616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.anyothermcpclient": {
    resourceKey: "m736974652e70616765696e746567726174652e616e796f746865726d6370636c69656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.anywhereatyourowndomain": {
    resourceKey: "m736974652e70616765696e746567726174652e616e7977686572656174796f75726f776e646f6d61696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.anywherethroughsolstoneme": {
    resourceKey: "m736974652e70616765696e746567726174652e616e7977686572657468726f756768736f6c73746f6e656d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.approveityourbrowseropensapage": {
    resourceKey: "m736974652e70616765696e746567726174652e617070726f76656974796f757262726f777365726f70656e736170616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.ascriptonthejournalscomputer": {
    resourceKey: "m736974652e70616765696e746567726174652e617363726970746f6e7468656a6f75726e616c73636f6d7075746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.asignedinagentonlyworksat": {
    resourceKey: "m736974652e70616765696e746567726174652e617369676e6564696e6167656e746f6e6c79776f726b736174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.ataglance": {
    resourceKey: "m736974652e70616765696e746567726174652e617461676c616e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.atoolthatneedsakindyou": {
    resourceKey: "m736974652e70616765696e746567726174652e61746f6f6c746861746e65656473616b696e64796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.authorization": {
    resourceKey: "m736974652e70616765696e746567726174652e617574686f72697a6174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.authorizewithpkces256andtheresource": {
    resourceKey: "m736974652e70616765696e746567726174652e617574686f72697a6577697468706b636573323536616e647468657265736f75726365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.buildanintegration": {
    resourceKey: "m736974652e70616765696e746567726174652e6275696c64616e696e746567726174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.changewhatitmayseerenamea": {
    resourceKey: "m736974652e70616765696e746567726174652e6368616e67657768617469746d617973656572656e616d6561",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.changingyourmind": {
    resourceKey: "m736974652e70616765696e746567726174652e6368616e67696e67796f75726d696e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.claudecode": {
    resourceKey: "m736974652e70616765696e746567726174652e636c61756465636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.claudeontheweb": {
    resourceKey: "m736974652e70616765696e746567726174652e636c617564656f6e746865776562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.codex": {
    resourceKey: "m736974652e70616765696e746567726174652e636f646578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.connectanagent": {
    resourceKey: "m736974652e70616765696e746567726174652e636f6e6e656374616e6167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.connectanagenttoyoursolstonejournal": {
    resourceKey: "m736974652e70616765696e746567726174652e636f6e6e656374616e6167656e74746f796f7572736f6c73746f6e656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.connectitfromthere": {
    resourceKey: "m736974652e70616765696e746567726174652e636f6e6e656374697466726f6d7468657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.contentoperationidbothrequired": {
    resourceKey: "m736974652e70616765696e746567726174652e636f6e74656e746f7065726174696f6e6964626f74687265717569726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.corecratessolstonecoremcpendpoint": {
    resourceKey: "m736974652e70616765696e746567726174652e636f7265637261746573736f6c73746f6e65636f72656d6370656e64706f696e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.createakeythengrantitwhat": {
    resourceKey: "m736974652e70616765696e746567726174652e637265617465616b65797468656e6772616e74697477686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.default": {
    resourceKey: "m736974652e70616765696e746567726174652e64656661756c74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.discovery": {
    resourceKey: "m736974652e70616765696e746567726174652e646973636f76657279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.docssolclimd": {
    resourceKey: "m736974652e70616765696e746567726174652e646f6373736f6c636c696d64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.eachtranscriptsegmentalsocarriessourcewhere": {
    resourceKey: "m736974652e70616765696e746567726174652e656163687472616e7363726970747365676d656e74616c736f63617272696573736f757263657768657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.earlydaysfoundsomethingthatdoesnt": {
    resourceKey: "m736974652e70616765696e746567726174652e6561726c7964617973666f756e64736f6d657468696e6774686174646f65736e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.entities": {
    resourceKey: "m736974652e70616765696e746567726174652e656e746974696573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.everycallischeckedagainwhenit": {
    resourceKey: "m736974652e70616765696e746567726174652e657665727963616c6c6973636865636b6564616761696e7768656e6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.everyconnectiongetsitsowngrantyou": {
    resourceKey: "m736974652e70616765696e746567726174652e6576657279636f6e6e656374696f6e676574736974736f776e6772616e74796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.facets": {
    resourceKey: "m736974652e70616765696e746567726174652e666163657473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.forexamplewithtranscriptsonlylimitedto": {
    resourceKey: "m736974652e70616765696e746567726174652e666f726578616d706c65776974687472616e736372697074736f6e6c796c696d69746564746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.geminicli": {
    resourceKey: "m736974652e70616765696e746567726174652e67656d696e69636c69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.grantswholejournalfacetskinds": {
    resourceKey: "m736974652e70616765696e746567726174652e6772616e747377686f6c656a6f75726e616c6661636574736b696e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.howagrantshapeswhattheagent": {
    resourceKey: "m736974652e70616765696e746567726174652e686f77616772616e74736861706573776861747468656167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.howlongitlasts": {
    resourceKey: "m736974652e70616765696e746567726174652e686f776c6f6e6769746c61737473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.howmuchofyourjournal": {
    resourceKey: "m736974652e70616765696e746567726174652e686f776d7563686f66796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.inputs": {
    resourceKey: "m736974652e70616765696e746567726174652e696e70757473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.integratewithsolstone": {
    resourceKey: "m736974652e70616765696e746567726174652e696e7465677261746577697468736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.integratewithsolstoneconnectanagentover": {
    resourceKey: "m736974652e70616765696e746567726174652e696e7465677261746577697468736f6c73746f6e65636f6e6e656374616e6167656e746f766572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.itsownnotes": {
    resourceKey: "m736974652e70616765696e746567726174652e6974736f776e6e6f746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.journaltextinwhatthetoolsreturn": {
    resourceKey: "m736974652e70616765696e746567726174652e6a6f75726e616c74657874696e77686174746865746f6f6c7372657475726e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.keysworkatthejournalsown": {
    resourceKey: "m736974652e70616765696e746567726174652e6b657973776f726b61747468656a6f75726e616c736f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.limit": {
    resourceKey: "m736974652e70616765696e746567726174652e6c696d6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.limits": {
    resourceKey: "m736974652e70616765696e746567726174652e6c696d697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.listthefacetsthisconnectionmaysee": {
    resourceKey: "m736974652e70616765696e746567726174652e6c69737474686566616365747374686973636f6e6e656374696f6e6d6179736565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.mcponwhicheverrouteyouturnon": {
    resourceKey: "m736974652e70616765696e746567726174652e6d63706f6e776869636865766572726f757465796f757475726e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.n16peragentendafter30minutes": {
    resourceKey: "m736974652e70616765696e746567726174652e6e31367065726167656e74656e64616674657233306d696e75746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.n200kb": {
    resourceKey: "m736974652e70616765696e746567726174652e6e3230306b62",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.n20notes65536bytes": {
    resourceKey: "m736974652e70616765696e746567726174652e6e32306e6f74657336353533366279746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.n256atonce64onthewifi": {
    resourceKey: "m736974652e70616765696e746567726174652e6e32353661746f6e636536346f6e74686577696669",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.n32768bytes": {
    resourceKey: "m736974652e70616765696e746567726174652e6e33323736386279746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.n8charactersoneuse10minutesone": {
    resourceKey: "m736974652e70616765696e746567726174652e6e38636861726163746572736f6e6575736531306d696e757465736f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.needs": {
    resourceKey: "m736974652e70616765696e746567726174652e6e65656473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.nothing": {
    resourceKey: "m736974652e70616765696e746567726174652e6e6f7468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.oauth21hostedbythejournal": {
    resourceKey: "m736974652e70616765696e746567726174652e6f617574683231686f7374656462797468656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.off5yrtherelaypassesencrypted": {
    resourceKey: "m736974652e70616765696e746567726174652e6f666635797274686572656c6179706173736573656e63727970746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.offers": {
    resourceKey: "m736974652e70616765696e746567726174652e6f6666657273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.offneedsalinuxserveryourun": {
    resourceKey: "m736974652e70616765696e746567726174652e6f66666e65656473616c696e7578736572766572796f7572756e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.offusesacertificatefromyourjournal": {
    resourceKey: "m736974652e70616765696e746567726174652e6f66667573657361636572746966696361746566726f6d796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.on": {
    resourceKey: "m736974652e70616765696e746567726174652e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.onerecallpage": {
    resourceKey: "m736974652e70616765696e746567726174652e6f6e65726563616c6c70616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.onesavednote": {
    resourceKey: "m736974652e70616765696e746567726174652e6f6e6573617665646e6f7465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.onthejournalscomputer": {
    resourceKey: "m736974652e70616765696e746567726174652e6f6e7468656a6f75726e616c73636f6d7075746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.onthispage": {
    resourceKey: "m736974652e70616765696e746567726174652e6f6e7468697370616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.openconnections": {
    resourceKey: "m736974652e70616765696e746567726174652e6f70656e636f6e6e656374696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.pairingcode": {
    resourceKey: "m736974652e70616765696e746567726174652e70616972696e67636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.pickwheretheagentrunsinyour": {
    resourceKey: "m736974652e70616765696e746567726174652e7069636b77686572657468656167656e7472756e73696e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.policy": {
    resourceKey: "m736974652e70616765696e746567726174652e706f6c696379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.protocol": {
    resourceKey: "m736974652e70616765696e746567726174652e70726f746f636f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.querydaydayfromdaytocontinuation": {
    resourceKey: "m736974652e70616765696e746567726174652e717565727964617964617966726f6d646179746f636f6e74696e756174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.readbackthisconnectionsownnotes": {
    resourceKey: "m736974652e70616765696e746567726174652e726561646261636b74686973636f6e6e656374696f6e736f776e6e6f746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.readthedocumentoractivityrecordbehind": {
    resourceKey: "m736974652e70616765696e746567726174652e72656164746865646f63756d656e746f7261637469766974797265636f7264626568696e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.readthesource": {
    resourceKey: "m736974652e70616765696e746567726174652e72656164746865736f75726365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.readthesourcepassagesanactivityspans": {
    resourceKey: "m736974652e70616765696e746567726174652e72656164746865736f757263657061737361676573616e61637469766974797370616e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.redirects": {
    resourceKey: "m736974652e70616765696e746567726174652e726564697265637473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.registration": {
    resourceKey: "m736974652e70616765696e746567726174652e726567697374726174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.requestbody": {
    resourceKey: "m736974652e70616765696e746567726174652e72657175657374626f6479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.routeskeysandthesolstonejournalmcp": {
    resourceKey: "m736974652e70616765696e746567726174652e726f757465736b657973616e64746865736f6c73746f6e656a6f75726e616c6d6370",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.scopes": {
    resourceKey: "m736974652e70616765696e746567726174652e73636f706573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.search": {
    resourceKey: "m736974652e70616765696e746567726174652e736561726368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.searchfindscalendareventsandanythingelse": {
    resourceKey: "m736974652e70616765696e746567726174652e73656172636866696e647363616c656e6461726576656e7473616e64616e797468696e67656c7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.searchwhatthisconnectionmayseescreen": {
    resourceKey: "m736974652e70616765696e746567726174652e7365617263687768617474686973636f6e6e656374696f6e6d617973656573637265656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.sessions": {
    resourceKey: "m736974652e70616765696e746567726174652e73657373696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.srcoauththewrittenreferencedocsmcp": {
    resourceKey: "m736974652e70616765696e746567726174652e7372636f617574687468657772697474656e7265666572656e6365646f63736d6370",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.srcpermissionsrs": {
    resourceKey: "m736974652e70616765696e746567726174652e7372637065726d697373696f6e737273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.srcregistryrstoolcodeinsrc": {
    resourceKey: "m736974652e70616765696e746567726174652e73726372656769737472797273746f6f6c636f6465696e737263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.theagentruns": {
    resourceKey: "m736974652e70616765696e746567726174652e7468656167656e7472756e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.theagentstooldescriptionsandinput": {
    resourceKey: "m736974652e70616765696e746567726174652e7468656167656e7473746f6f6c6465736372697074696f6e73616e64696e707574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.thefacetandcategoryargumentsonlylist": {
    resourceKey: "m736974652e70616765696e746567726174652e7468656661636574616e6463617465676f7279617267756d656e74736f6e6c796c697374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.themcpserver": {
    resourceKey: "m736974652e70616765696e746567726174652e7468656d6370736572766572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.thentalktoitlikeanymcp": {
    resourceKey: "m736974652e70616765696e746567726174652e7468656e74616c6b746f69746c696b65616e796d6370",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.theserverisopensourceifyou": {
    resourceKey: "m736974652e70616765696e746567726174652e74686573657276657269736f70656e736f757263656966796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.thetoolstheirschemasandhowa": {
    resourceKey: "m736974652e70616765696e746567726174652e746865746f6f6c737468656972736368656d6173616e64686f7761",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.tohaveyouragentreaditgive": {
    resourceKey: "m736974652e70616765696e746567726174652e746f68617665796f75726167656e7472656164697467697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.tokens": {
    resourceKey: "m736974652e70616765696e746567726174652e746f6b656e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.tool": {
    resourceKey: "m736974652e70616765696e746567726174652e746f6f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.tools": {
    resourceKey: "m736974652e70616765696e746567726174652e746f6f6c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.transcripttimesusetherecordingdevices": {
    resourceKey: "m736974652e70616765696e746567726174652e7472616e73637269707474696d65737573657468657265636f7264696e6764657669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.typemcpchoosejournal": {
    resourceKey: "m736974652e70616765696e746567726174652e747970656d637063686f6f73656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.what": {
    resourceKey: "m736974652e70616765696e746567726174652e77686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.whatitis": {
    resourceKey: "m736974652e70616765696e746567726174652e7768617469746973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.whatkindsofmaterial": {
    resourceKey: "m736974652e70616765696e746567726174652e776861746b696e64736f666d6174657269616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.whatyoucontrol": {
    resourceKey: "m736974652e70616765696e746567726174652e77686174796f75636f6e74726f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.where": {
    resourceKey: "m736974652e70616765696e746567726174652e7768657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.whereitconnectsfrom": {
    resourceKey: "m736974652e70616765696e746567726174652e77686572656974636f6e6e6563747366726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.writes": {
    resourceKey: "m736974652e70616765696e746567726174652e777269746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.wrongcodes": {
    resourceKey: "m736974652e70616765696e746567726174652e77726f6e67636f646573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.youragentdiscoverstheavailabletoolsthrough": {
    resourceKey: "m736974652e70616765696e746567726174652e796f75726167656e74646973636f76657273746865617661696c61626c65746f6f6c737468726f756768",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.yourchoices": {
    resourceKey: "m736974652e70616765696e746567726174652e796f757263686f69636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.yourjournalrunsanmcpserverthis": {
    resourceKey: "m736974652e70616765696e746567726174652e796f75726a6f75726e616c72756e73616e6d637073657276657274686973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pageintegrate.yourwholejournalwithtranscriptsandfacets": {
    resourceKey: "m736974652e70616765696e746567726174652e796f757277686f6c656a6f75726e616c776974687472616e73637269707473616e64666163657473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagephone.androidsourceongithub": {
    resourceKey: "m736974652e7061676570686f6e652e616e64726f6964736f757263656f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagephone.freeongoogleplayneedsandroid8": {
    resourceKey: "m736974652e7061676570686f6e652e667265656f6e676f6f676c65706c61796e65656473616e64726f696438",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagephone.iphonesourceongithub": {
    resourceKey: "m736974652e7061676570686f6e652e6970686f6e65736f757263656f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagephone.oniphoneandipadgetthesolstone": {
    resourceKey: "m736974652e7061676570686f6e652e6f6e6970686f6e65616e6469706164676574746865736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagephone.solstoneisopensourcereadthecode": {
    resourceKey: "m736974652e7061676570686f6e652e736f6c73746f6e6569736f70656e736f7572636572656164746865636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagephone.whattheappneeds": {
    resourceKey: "m736974652e7061676570686f6e652e776861747468656170706e65656473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.pagephone.youdonthavetotakeour": {
    resourceKey: "m736974652e7061676570686f6e652e796f75646f6e7468617665746f74616b656f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.androidappreleases": {
    resourceKey: "m736974652e72656c65617365732e616e64726f696461707072656c6561736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.androidappreleasessolstone": {
    resourceKey: "m736974652e72656c65617365732e616e64726f696461707072656c6561736573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.articlejournal": {
    resourceKey: "m736974652e72656c65617365732e61727469636c656a6f75726e616c",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.releases.articlethejournalappformac": {
    resourceKey: "m736974652e72656c65617365732e61727469636c657468656a6f75726e616c617070666f726d6163",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.releases.articlethesolstoneappforandroid": {
    resourceKey: "m736974652e72656c65617365732e61727469636c65746865736f6c73746f6e65617070666f72616e64726f6964",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.releases.articlethesolstoneappforiphone": {
    resourceKey: "m736974652e72656c65617365732e61727469636c65746865736f6c73746f6e65617070666f726970686f6e65",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.releases.articlethesolstoneappforlinux": {
    resourceKey: "m736974652e72656c65617365732e61727469636c65746865736f6c73746f6e65617070666f726c696e7578",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.releases.articlethesolstoneappformac": {
    resourceKey: "m736974652e72656c65617365732e61727469636c65746865736f6c73746f6e65617070666f726d6163",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.releases.articlethesolstoneappforwearos": {
    resourceKey: "m736974652e72656c65617365732e61727469636c65746865736f6c73746f6e65617070666f72776561726f73",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.releases.articlethesolstoneappforwindows": {
    resourceKey: "m736974652e72656c65617365732e61727469636c65746865736f6c73746f6e65617070666f7277696e646f7773",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.releases.getthewatchapp": {
    resourceKey: "m736974652e72656c65617365732e6765747468657761746368617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.installthesolstoneappforlinux": {
    resourceKey: "m736974652e72656c65617365732e696e7374616c6c746865736f6c73746f6e65617070666f726c696e7578",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.introandroid": {
    resourceKey: "m736974652e72656c65617365732e696e74726f616e64726f6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.introwear": {
    resourceKey: "m736974652e72656c65617365732e696e74726f77656172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.iphoneappreleases": {
    resourceKey: "m736974652e72656c65617365732e6970686f6e6561707072656c6561736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.iphoneappreleasessolstone": {
    resourceKey: "m736974652e72656c65617365732e6970686f6e6561707072656c6561736573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.journalappreleases": {
    resourceKey: "m736974652e72656c65617365732e6a6f75726e616c61707072656c6561736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.journalappreleasessolstone": {
    resourceKey: "m736974652e72656c65617365732e6a6f75726e616c61707072656c6561736573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.journalreleases": {
    resourceKey: "m736974652e72656c65617365732e6a6f75726e616c72656c6561736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.journalreleasessolstone": {
    resourceKey: "m736974652e72656c65617365732e6a6f75726e616c72656c6561736573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.linuxappreleases": {
    resourceKey: "m736974652e72656c65617365732e6c696e757861707072656c6561736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.linuxappreleasessolstone": {
    resourceKey: "m736974652e72656c65617365732e6c696e757861707072656c6561736573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.macappreleases": {
    resourceKey: "m736974652e72656c65617365732e6d616361707072656c6561736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.macappreleasessolstone": {
    resourceKey: "m736974652e72656c65617365732e6d616361707072656c6561736573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthapril": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e7468617072696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthaugust": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e7468617567757374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthdecember": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e7468646563656d626572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthfebruary": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e74686665627275617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthjanuary": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e74686a616e75617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthjuly": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e74686a756c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthjune": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e74686a756e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthmarch": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e74686d61726368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthmay": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e74686d6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthnovember": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e74686e6f76656d626572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthoctober": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e74686f63746f626572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.monthseptember": {
    resourceKey: "m736974652e72656c65617365732e6d6f6e746873657074656d626572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.releasenotesforthejournalonmac": {
    resourceKey: "m736974652e72656c65617365732e72656c656173656e6f746573666f727468656a6f75726e616c6f6e6d6163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.releasenotesforthesolstoneandroidapp": {
    resourceKey: "m736974652e72656c65617365732e72656c656173656e6f746573666f72746865736f6c73746f6e65616e64726f6964617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.releasenotesforthesolstoneappfor": {
    resourceKey: "m736974652e72656c65617365732e72656c656173656e6f746573666f72746865736f6c73746f6e65617070666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.releasenotesforthesolstoneappforx0be66cb8": {
    resourceKey: "m736974652e72656c65617365732e72656c656173656e6f746573666f72746865736f6c73746f6e65617070666f72783062653636636238",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.releasenotesforthesolstoneappon": {
    resourceKey: "m736974652e72656c65617365732e72656c656173656e6f746573666f72746865736f6c73746f6e656170706f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.releasenotesforthesolstonelinuxapp": {
    resourceKey: "m736974652e72656c65617365732e72656c656173656e6f746573666f72746865736f6c73746f6e656c696e7578617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.releasenotesforthesolstonewindowsapp": {
    resourceKey: "m736974652e72656c65617365732e72656c656173656e6f746573666f72746865736f6c73746f6e6577696e646f7773617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.seeandroidappreleasesongithub": {
    resourceKey: "m736974652e72656c65617365732e736565616e64726f696461707072656c65617365736f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.seeiphoneappreleasesongithub": {
    resourceKey: "m736974652e72656c65617365732e7365656970686f6e6561707072656c65617365736f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.seejournalappreleasesongithub": {
    resourceKey: "m736974652e72656c65617365732e7365656a6f75726e616c61707072656c65617365736f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.seejournalreleasesongithub": {
    resourceKey: "m736974652e72656c65617365732e7365656a6f75726e616c72656c65617365736f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.seelinuxappreleasesongithub": {
    resourceKey: "m736974652e72656c65617365732e7365656c696e757861707072656c65617365736f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.seemacappreleasesongithub": {
    resourceKey: "m736974652e72656c65617365732e7365656d616361707072656c65617365736f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.seewearosappreleasesongithub": {
    resourceKey: "m736974652e72656c65617365732e736565776561726f7361707072656c65617365736f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.seewindowsappreleasesongithub": {
    resourceKey: "m736974652e72656c65617365732e73656577696e646f777361707072656c65617365736f6e676974687562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.storemarks": {
    resourceKey: "m736974652e72656c65617365732e73746f72656d61726b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.thesearetheiphoneappsown": {
    resourceKey: "m736974652e72656c65617365732e74686573656172657468656970686f6e65617070736f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.thesearethejournalsownchanges": {
    resourceKey: "m736974652e72656c65617365732e74686573656172657468656a6f75726e616c736f776e6368616e676573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.thesearethelinuxappsown": {
    resourceKey: "m736974652e72656c65617365732e74686573656172657468656c696e7578617070736f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.thesearethemacappsown": {
    resourceKey: "m736974652e72656c65617365732e74686573656172657468656d6163617070736f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.thesearethewindowsappsown": {
    resourceKey: "m736974652e72656c65617365732e746865736561726574686577696e646f7773617070736f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.unavailable": {
    resourceKey: "m736974652e72656c65617365732e756e617661696c61626c65",
    formatIntent: "text",
    arguments: [
      { name: "link", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.releases.wearosappreleases": {
    resourceKey: "m736974652e72656c65617365732e776561726f7361707072656c6561736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.wearosappreleasessolstone": {
    resourceKey: "m736974652e72656c65617365732e776561726f7361707072656c6561736573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.whatsnewinthejournalin": {
    resourceKey: "m736974652e72656c65617365732e77686174736e6577696e7468656a6f75726e616c696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.whatsnewinthejournalnewest": {
    resourceKey: "m736974652e72656c65617365732e77686174736e6577696e7468656a6f75726e616c6e6577657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.windowsappreleases": {
    resourceKey: "m736974652e72656c65617365732e77696e646f777361707072656c6561736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releases.windowsappreleasessolstone": {
    resourceKey: "m736974652e72656c65617365732e77696e646f777361707072656c6561736573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasestreams.androidapp": {
    resourceKey: "m736974652e72656c6561736573747265616d732e616e64726f6964617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasestreams.iphoneapp": {
    resourceKey: "m736974652e72656c6561736573747265616d732e6970686f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasestreams.linuxapp": {
    resourceKey: "m736974652e72656c6561736573747265616d732e6c696e7578617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasestreams.macapp": {
    resourceKey: "m736974652e72656c6561736573747265616d732e6d6163617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasestreams.releasenotesfor": {
    resourceKey: "m736974652e72656c6561736573747265616d732e72656c656173656e6f746573666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasestreams.releasestreams": {
    resourceKey: "m736974652e72656c6561736573747265616d732e72656c6561736573747265616d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasestreams.wearosapp": {
    resourceKey: "m736974652e72656c6561736573747265616d732e776561726f73617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasestreams.windowsapp": {
    resourceKey: "m736974652e72656c6561736573747265616d732e77696e646f7773617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasetemplate.n2026solpbcyourjournalisalways": {
    resourceKey: "m736974652e72656c6561736574656d706c6174652e6e32303236736f6c706263796f75726a6f75726e616c6973616c77617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.releasetemplate.releasehistory": {
    resourceKey: "m736974652e72656c6561736574656d706c6174652e72656c65617365686973746f7279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.skill.fetchtheinstallguideandfollowit": {
    resourceKey: "m736974652e736b696c6c2e6665746368746865696e7374616c6c6775696465616e64666f6c6c6f776974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.skill.instructions": {
    resourceKey: "m736974652e736b696c6c2e696e737472756374696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.skill.quickreference": {
    resourceKey: "m736974652e736b696c6c2e717569636b7265666572656e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.skill.solpbcisapublicbenefitcorporation": {
    resourceKey: "m736974652e736b696c6c2e736f6c7062636973617075626c696362656e65666974636f72706f726174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.skill.solstoneinstallation": {
    resourceKey: "m736974652e736b696c6c2e736f6c73746f6e65696e7374616c6c6174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.skill.theguidecoversplatformsprerequisitesinstallationse": {
    resourceKey: "m736974652e736b696c6c2e7468656775696465636f76657273706c6174666f726d7370726572657175697369746573696e7374616c6c6174696f6e7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.codingagentskilllinuxsetupaddsit": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e636f64696e676167656e74736b696c6c6c696e75787365747570616464736974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.configureonlinuxfollowthesetuppage": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e636f6e6669677572656f6e6c696e7578666f6c6c6f77746865736574757070616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.docshttpssolstoneappllmstxt": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e646f63736874747073736f6c73746f6e656170706c6c6d73747874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.installandconfiguresolstoneapersonaljournal": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e696e7374616c6c616e64636f6e666967757265736f6c73746f6e6561706572736f6e616c6a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.installonlinuxfirstaddtheopenmp": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e696e7374616c6c6f6e6c696e757866697273746164647468656f70656e6d70",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.installonmaccurlfsslhttpssolstone": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e696e7374616c6c6f6e6d61636375726c6673736c6874747073736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.installonwindowsdownloadhttpssolstoneapp": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e696e7374616c6c6f6e77696e646f7773646f776e6c6f61646874747073736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.linuxthejournalshipsasoneself": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e6c696e75787468656a6f75726e616c736869707361736f6e6573656c66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.macthejournalappistheonly": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e6d61637468656a6f75726e616c61707069737468656f6e6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.movingfromanoldercommandlineinstall": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e6d6f76696e6766726f6d616e6f6c646572636f6d6d616e646c696e65696e7374616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.movingfromapipuvorpipx": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e6d6f76696e6766726f6d6170697075766f7270697078",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.platformslinuxx8664andaarch64macos": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e706c6174666f726d736c696e75787838363634616e64616172636836346d61636f73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.repohttpsgithubcomsolpbcsolstonejournal": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e7265706f6874747073676974687562636f6d736f6c706263736f6c73746f6e656a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.solstoneappmachttpsgithubcomsolpbc": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e736f6c73746f6e656170706d61636874747073676974687562636f6d736f6c706263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.wellknownskillsdefaultskillmd.theseinstructionsareforacodingagent": {
    resourceKey: "m736974652e77656c6c6b6e6f776e736b696c6c7364656661756c74736b696c6c6d642e7468657365696e737472756374696f6e73617265666f7261636f64696e676167656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.worker.aboutgb": {
    resourceKey: "m736974652e776f726b65722e61626f75746762",
    formatIntent: "text",
    arguments: [
      { name: "size", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.worker.aboutmb": {
    resourceKey: "m736974652e776f726b65722e61626f75746d62",
    formatIntent: "text",
    arguments: [
      { name: "size", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.worker.androiddigest": {
    resourceKey: "m736974652e776f726b65722e616e64726f6964646967657374",
    formatIntent: "text",
    arguments: [
      { name: "url", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.worker.androiddigestfallback": {
    resourceKey: "m736974652e776f726b65722e616e64726f696464696765737466616c6c6261636b",
    formatIntent: "text",
    arguments: [
      { name: "url", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.worker.androidversion": {
    resourceKey: "m736974652e776f726b65722e616e64726f696476657273696f6e",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.worker.androidversionsized": {
    resourceKey: "m736974652e776f726b65722e616e64726f696476657273696f6e73697a6564",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "size", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.worker.downloadunavailableandroid": {
    resourceKey: "m736974652e776f726b65722e646f776e6c6f6164756e617661696c61626c65616e64726f6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.worker.downloadunavailablejournalmacos": {
    resourceKey: "m736974652e776f726b65722e646f776e6c6f6164756e617661696c61626c656a6f75726e616c6d61636f73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.worker.downloadunavailablejournalwindows": {
    resourceKey: "m736974652e776f726b65722e646f776e6c6f6164756e617661696c61626c656a6f75726e616c77696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.worker.downloadunavailablemacboth": {
    resourceKey: "m736974652e776f726b65722e646f776e6c6f6164756e617661696c61626c656d6163626f7468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.worker.downloadunavailablemacos": {
    resourceKey: "m736974652e776f726b65722e646f776e6c6f6164756e617661696c61626c656d61636f73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.worker.downloadunavailablewear": {
    resourceKey: "m736974652e776f726b65722e646f776e6c6f6164756e617661696c61626c6577656172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.worker.downloadunavailablewindows": {
    resourceKey: "m736974652e776f726b65722e646f776e6c6f6164756e617661696c61626c6577696e646f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.worker.forandroid80andlater": {
    resourceKey: "m736974652e776f726b65722e666f72616e64726f69643830616e646c61746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "site.worker.macbothapp": {
    resourceKey: "m736974652e776f726b65722e6d6163626f7468617070",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.worker.macbothjournal": {
    resourceKey: "m736974652e776f726b65722e6d6163626f74686a6f75726e616c",
    formatIntent: "text",
    arguments: [
      { name: "version", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.worker.mb": {
    resourceKey: "m736974652e776f726b65722e6d62",
    formatIntent: "text",
    arguments: [
      { name: "size", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "site.worker.sizelead": {
    resourceKey: "m736974652e776f726b65722e73697a656c656164",
    formatIntent: "text",
    arguments: [
      { name: "size", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
};

const BUNDLES = new Map();

function getBundle(locale, useIsolating) {
  const cacheKey = `${locale}:${useIsolating}`;
  let bundle = BUNDLES.get(cacheKey);
  if (!bundle) {
    const locInfo = LOCALES[locale];
    if (!locInfo) throw new Error(`Unknown locale: ${locale}`);
    const ftlSource = CATALOGS[locale];
    if (ftlSource === undefined) throw new Error(`Unknown catalog: ${locale}`);
    const resource = new FluentResource(ftlSource);
    bundle = new FluentBundle(locInfo.bundleLocale, { useIsolating });
    const errors = bundle.addResource(resource);
    if (errors.length > 0) throw new Error(`FTL errors: ${errors.join(", ")}`);
    BUNDLES.set(cacheKey, bundle);
  }
  return bundle;
}

export function render(locale, messageId, args = [], { useIsolating = true } = {}) {
  if (typeof useIsolating !== "boolean") throw new Error("Expected boolean useIsolating");
  const locInfo = LOCALES[locale];
  if (!locInfo) throw new Error(`Unknown locale: ${locale}`);

  const msgInfo = MESSAGES[messageId];
  if (!msgInfo) throw new Error(`Unknown message: ${messageId}`);

  const seen = new Set();
  for (const [k] of args) {
    if (seen.has(k)) throw new Error(`Duplicate argument: ${k}`);
    seen.add(k);
  }

  const declaredMap = new Map(msgInfo.arguments.map(a => [a.name, a]));
  for (const [k] of args) {
    if (!declaredMap.has(k)) throw new Error(`Unknown argument: ${k}`);
  }
  for (const k of declaredMap.keys()) {
    if (!seen.has(k)) throw new Error(`Missing argument: ${k}`);
  }

  const fArgs = {};
  let selectedVariant = msgInfo.enumDefault || null;

  for (const [k, v] of args) {
    const spec = declaredMap.get(k);
    if (spec.type === "string") {
      if (typeof v !== "string") throw new Error(`Expected string for ${k}`);
      if (msgInfo.formatIntent === "enum" && msgInfo.selectorVar === k) {
        if (msgInfo.enumValues.includes(v)) {
          selectedVariant = v;
        } else {
          selectedVariant = msgInfo.enumDefault;
        }
      }
      fArgs[k] = v;
    } else if (spec.type === "boolean") {
      if (typeof v !== "boolean") throw new Error(`Expected boolean for ${k}`);
      fArgs[k] = v ? "true" : "false";
    } else if (spec.type === "integer") {
      if (v && typeof v === "object" && v.type === "cardinal") throw new Error(`Expected integer, got cardinal for ${k}`);
      const num = (v && typeof v === "object" && v.type === "integer") ? v.value : v;
      if (typeof num !== "number" && typeof num !== "bigint") throw new Error(`Expected number for ${k}`);
      if (typeof num === "number" && (!Number.isFinite(num) || !Number.isInteger(num))) throw new Error(`Expected integer number for ${k}`);
      const nVal = BigInt(num);
      const minVal = spec.min !== null ? BigInt(spec.min) : -9007199254740991n;
      const maxVal = spec.max !== null ? BigInt(spec.max) : 9007199254740991n;
      const effMin = minVal < -9007199254740991n ? -9007199254740991n : minVal;
      const effMax = maxVal > 9007199254740991n ? 9007199254740991n : maxVal;
      if (nVal < effMin || nVal > effMax) throw new Error(`Out of range for ${k}`);
      fArgs[k] = Number(nVal);
    } else if (spec.type === "cardinal") {
      if (v && typeof v === "object" && v.type === "integer") throw new Error(`Expected cardinal, got integer for ${k}`);
      const num = (v && typeof v === "object" && v.type === "cardinal") ? v.value : v;
      if (typeof num !== "number" && typeof num !== "bigint") throw new Error(`Expected number for ${k}`);
      if (typeof num === "number" && (!Number.isFinite(num) || !Number.isInteger(num))) throw new Error(`Expected integer number for ${k}`);
      const nVal = BigInt(num);
      const minVal = spec.min !== null ? BigInt(spec.min) : -2147483648n;
      const maxVal = spec.max !== null ? BigInt(spec.max) : 2147483647n;
      const effMin = minVal < -2147483648n ? -2147483648n : minVal;
      const effMax = maxVal > 2147483647n ? 2147483647n : maxVal;
      if (nVal < effMin || nVal > effMax) throw new Error(`Out of range for ${k}`);
      fArgs[k] = Number(nVal);
    }
  }

  if (msgInfo.formatIntent === "cardinal") {
    const select = CATEGORIES[locInfo.cardinal];
    fArgs.i18nCategory = select ? select(Math.abs(fArgs[msgInfo.selectorVar])) : "other";
  }

  const bundle = getBundle(locale, useIsolating);

  const targetKey = msgInfo.formatIntent === "enum" ? (msgInfo.variantKeys[selectedVariant] || msgInfo.defaultKey) : msgInfo.resourceKey;
  const message = bundle.getMessage(targetKey);
  if (!message || !message.value) throw new Error(`Message not found: ${targetKey}`);

  const formatErrors = [];
  const output = bundle.formatPattern(message.value, fArgs, formatErrors);
  if (formatErrors.length > 0) throw new Error(`Format error: ${formatErrors.join(", ")}`);
  return output;
}
