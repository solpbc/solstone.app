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
  "account.billing.backyourprivatenetwork": {
    resourceKey: "m6163636f756e742e62696c6c696e672e6261636b796f7572707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.billing": {
    resourceKey: "m6163636f756e742e62696c6c696e672e62696c6c696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.billingcouldntstarttryagain": {
    resourceKey: "m6163636f756e742e62696c6c696e672e62696c6c696e67636f756c646e747374617274747279616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.billingmanagementdidntopentryagain": {
    resourceKey: "m6163636f756e742e62696c6c696e672e62696c6c696e676d616e6167656d656e746469646e746f70656e747279616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.billingmanagementdidntopentryagain2": {
    resourceKey: "m6163636f756e742e62696c6c696e672e62696c6c696e676d616e6167656d656e746469646e746f70656e747279616761696e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.billingmanagementisavailableafterencryptedbackup": {
    resourceKey: "m6163636f756e742e62696c6c696e672e62696c6c696e676d616e6167656d656e746973617661696c61626c656166746572656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.billingmanagementisavailableafterhostingstarts": {
    resourceKey: "m6163636f756e742e62696c6c696e672e62696c6c696e676d616e6167656d656e746973617661696c61626c656166746572686f7374696e67737461727473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.billingmanagementisavailableoncepaymenthas": {
    resourceKey: "m6163636f756e742e62696c6c696e672e62696c6c696e676d616e6167656d656e746973617661696c61626c656f6e63657061796d656e74686173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.billingmanagementopensonceyouvepaid": {
    resourceKey: "m6163636f756e742e62696c6c696e672e62696c6c696e676d616e6167656d656e746f70656e736f6e6365796f75766570616964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.billingneedsanemailaddressonyour": {
    resourceKey: "m6163636f756e742e62696c6c696e672e62696c6c696e676e65656473616e656d61696c616464726573736f6e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.chooseyearlyormonthlybilling": {
    resourceKey: "m6163636f756e742e62696c6c696e672e63686f6f7365796561726c796f726d6f6e74686c7962696c6c696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.complimentarywhileyoureanapprovedscout": {
    resourceKey: "m6163636f756e742e62696c6c696e672e636f6d706c696d656e746172797768696c65796f757265616e617070726f76656473636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.confidentialprocessingisalreadycomplimentaryforyou": {
    resourceKey: "m6163636f756e742e62696c6c696e672e636f6e666964656e7469616c70726f63657373696e676973616c7265616479636f6d706c696d656e74617279666f72796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.confirmyouunderstandbeforecontinuing": {
    resourceKey: "m6163636f756e742e62696c6c696e672e636f6e6669726d796f75756e6465727374616e646265666f7265636f6e74696e75696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.freewhileyoureanapprovedscout": {
    resourceKey: "m6163636f756e742e62696c6c696e672e667265657768696c65796f757265616e617070726f76656473636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.managebilling": {
    resourceKey: "m6163636f756e742e62696c6c696e672e6d616e61676562696c6c696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.managebillingtokeepit": {
    resourceKey: "m6163636f756e742e62696c6c696e672e6d616e61676562696c6c696e67746f6b6565706974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.nochargemade": {
    resourceKey: "m6163636f756e742e62696c6c696e672e6e6f6368617267656d616465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.nochargemadeyoucanturnon": {
    resourceKey: "m6163636f756e742e62696c6c696e672e6e6f6368617267656d616465796f7563616e7475726e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.nochargemadeyoucanturnon2": {
    resourceKey: "m6163636f756e742e62696c6c696e672e6e6f6368617267656d616465796f7563616e7475726e6f6e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.nopaidserviceisonyoursign": {
    resourceKey: "m6163636f756e742e62696c6c696e672e6e6f706169647365727669636569736f6e796f75727369676e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.paymentreceiveditcantakemomentshow": {
    resourceKey: "m6163636f756e742e62696c6c696e672e7061796d656e747265636569766564697463616e74616b656d6f6d656e7473686f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.paymentreceiveditcantakemomentshow2": {
    resourceKey: "m6163636f756e742e62696c6c696e672e7061796d656e747265636569766564697463616e74616b656d6f6d656e7473686f7732",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.privatenetwork": {
    resourceKey: "m6163636f756e742e62696c6c696e672e707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.releasedthatjournalnolongerusesyour": {
    resourceKey: "m6163636f756e742e62696c6c696e672e72656c6561736564746861746a6f75726e616c6e6f6c6f6e67657275736573796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.renewsautomatically": {
    resourceKey: "m6163636f756e742e62696c6c696e672e72656e6577736175746f6d61746963616c6c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.renewsautomaticallyat2": {
    resourceKey: "m6163636f756e742e62696c6c696e672e72656e6577736175746f6d61746963616c6c79617432",
    formatIntent: "text",
    arguments: [
      { name: "price", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "tax", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.billing.renewsonat2": {
    resourceKey: "m6163636f756e742e62696c6c696e672e72656e6577736f6e617432",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "price", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "tax", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.billing.renewsonthepricedidntloadmanagebillingtoseeit": {
    resourceKey: "m6163636f756e742e62696c6c696e672e72656e6577736f6e74686570726963656469646e746c6f61646d616e61676562696c6c696e67746f7365656974",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.billing.scheduledtostopattheendofthepaidperiod": {
    resourceKey: "m6163636f756e742e62696c6c696e672e7363686564756c6564746f73746f706174746865656e646f6674686570616964706572696f64",
    formatIntent: "text",
    arguments: [
      { name: "keep", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.billing.scheduledtostopon": {
    resourceKey: "m6163636f756e742e62696c6c696e672e7363686564756c6564746f73746f706f6e",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "keep", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.billing.scout": {
    resourceKey: "m6163636f756e742e62696c6c696e672e73636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.seeservices": {
    resourceKey: "m6163636f756e742e62696c6c696e672e7365657365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.servicesyoupaysolpbcforwhat": {
    resourceKey: "m6163636f756e742e62696c6c696e672e7365727669636573796f75706179736f6c706263666f7277686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.stopped": {
    resourceKey: "m6163636f756e742e62696c6c696e672e73746f70706564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.stoppedon2": {
    resourceKey: "m6163636f756e742e62696c6c696e672e73746f707065646f6e32",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.billing.stripeholdsyourcardyourreceiptsand": {
    resourceKey: "m6163636f756e742e62696c6c696e672e737472697065686f6c6473796f757263617264796f75727265636569707473616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.thatjournalwasalreadyreleased": {
    resourceKey: "m6163636f756e742e62696c6c696e672e746861746a6f75726e616c776173616c726561647972656c6561736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.thissigninalreadyhassubscription": {
    resourceKey: "m6163636f756e742e62696c6c696e672e746869737369676e696e616c7265616479686173737562736372697074696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.youdontpayforanything": {
    resourceKey: "m6163636f756e742e62696c6c696e672e796f75646f6e74706179666f72616e797468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.yourealreadycoveredfreeasscout": {
    resourceKey: "m6163636f756e742e62696c6c696e672e796f757265616c7265616479636f766572656466726565617373636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.yourprivatenetwork": {
    resourceKey: "m6163636f756e742e62696c6c696e672e796f7572707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.yourprivatenetwork2": {
    resourceKey: "m6163636f756e742e62696c6c696e672e796f7572707269766174656e6574776f726b32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.yourservices": {
    resourceKey: "m6163636f756e742e62696c6c696e672e796f75727365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.billing.yourservices2": {
    resourceKey: "m6163636f756e742e62696c6c696e672e796f7572736572766963657332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.acancellationofyoursubscriptioneverytoendon": {
    resourceKey: "m6163636f756e742e63616e63656c2e6163616e63656c6c6174696f6e6f66796f7572737562736372697074696f6e6576657279746f656e646f6e",
    formatIntent: "text",
    arguments: [
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "price", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "interval", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "endDate", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.cancel.afteritstopswekeepyourencryptedbackupcopyfor30": {
    resourceKey: "m6163636f756e742e63616e63656c2e6166746572697473746f707377656b656570796f7572656e637279707465646261636b7570636f7079666f723330",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.cancelcontractshere": {
    resourceKey: "m6163636f756e742e63616e63656c2e63616e63656c636f6e74726163747368657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.cancelnow": {
    resourceKey: "m6163636f756e742e63616e63656c2e63616e63656c6e6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.changedyourmindsubscribeagainanytimefromservic": {
    resourceKey: "m6163636f756e742e63616e63656c2e6368616e676564796f75726d696e64737562736372696265616761696e616e7974696d6566726f6d736572766963",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.continue": {
    resourceKey: "m6163636f756e742e63616e63656c2e636f6e74696e7565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.email": {
    resourceKey: "m6163636f756e742e63616e63656c2e656d61696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.endson": {
    resourceKey: "m6163636f756e742e63616e63656c2e656e64736f6e",
    formatIntent: "text",
    arguments: [
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "endDate", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.cancel.keepsworkinguntilthenstopsanditwontrenew": {
    resourceKey: "m6163636f756e742e63616e63656c2e6b65657073776f726b696e67756e74696c7468656e73746f7073616e646974776f6e7472656e6577",
    formatIntent: "text",
    arguments: [
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "endDate", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.cancel.name": {
    resourceKey: "m6163636f756e742e63616e63656c2e6e616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.stoppedwhenyoucanceledanditwontrenew": {
    resourceKey: "m6163636f756e742e63616e63656c2e73746f707065647768656e796f7563616e63656c6564616e646974776f6e7472656e6577",
    formatIntent: "text",
    arguments: [
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.cancel.theaddressyouresignedinwiththisconfirmationgoe": {
    resourceKey: "m6163636f756e742e63616e63656c2e74686561646472657373796f7572657369676e6564696e7769746874686973636f6e6669726d6174696f6e676f65",
    formatIntent: "text",
    arguments: [
      { name: "name", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "email", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.cancel.thissigninhasnoemailaddressto": {
    resourceKey: "m6163636f756e742e63616e63656c2e746869737369676e696e6861736e6f656d61696c61646472657373746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.wellansweryourreasonandwhetherwerefundmore": {
    resourceKey: "m6163636f756e742e63616e63656c2e77656c6c616e73776572796f7572726561736f6e616e64776865746865727765726566756e646d6f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.wereceivedyourcancellationkeepthisemailit": {
    resourceKey: "m6163636f756e742e63616e63656c2e77657265636569766564796f757263616e63656c6c6174696f6e6b65657074686973656d61696c6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.wererefundingforthewholeleftthesamewayyoupaidw": {
    resourceKey: "m6163636f756e742e63616e63656c2e77657265726566756e64696e67666f7274686577686f6c656c65667474686573616d65776179796f757061696477",
    formatIntent: "text",
    arguments: [
      { name: "refund", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "refundMonths", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "pluralSuffix", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.cancel.whathappensnow": {
    resourceKey: "m6163636f756e742e63616e63656c2e7768617468617070656e736e6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.whatyousentus2": {
    resourceKey: "m6163636f756e742e63616e63656c2e77686174796f7573656e74757332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.youcanstillwithdrawforafullrefunduntiltheendof": {
    resourceKey: "m6163636f756e742e63616e63656c2e796f7563616e7374696c6c7769746864726177666f726166756c6c726566756e64756e74696c746865656e646f66",
    formatIntent: "text",
    arguments: [
      { name: "windowDate", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.cancel.yougaveaseriousreason": {
    resourceKey: "m6163636f756e742e63616e63656c2e796f756761766561736572696f7573726561736f6e",
    formatIntent: "text",
    arguments: [
      { name: "reason", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.cancel.yoursolstonemeaddressstaysreservedforyouandsub": {
    resourceKey: "m6163636f756e742e63616e63656c2e796f7572736f6c73746f6e656d656164647265737373746179737265736572766564666f72796f75616e64737562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.yoursubscriptiondetailsdidntloadtryagain": {
    resourceKey: "m6163636f756e742e63616e63656c2e796f7572737562736372697074696f6e64657461696c736469646e746c6f6164747279616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.cancel.yoursubscriptionendson": {
    resourceKey: "m6163636f756e742e63616e63656c2e796f7572737562736372697074696f6e656e64736f6e",
    formatIntent: "text",
    arguments: [
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "endDate", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.checkout.beforeyousubscribethekeyfacts": {
    resourceKey: "m6163636f756e742e636865636b6f75742e6265666f7265796f757375627363726962657468656b65796661637473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.bypurchasingthisserviceyouagreeenroll": {
    resourceKey: "m6163636f756e742e636865636b6f75742e627970757263686173696e677468697373657276696365796f756167726565656e726f6c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.bypurchasingthisserviceyouagreetoenrollinanaut": {
    resourceKey: "m6163636f756e742e636865636b6f75742e627970757263686173696e677468697373657276696365796f756167726565746f656e726f6c6c696e616e617574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.howtoenditsigninatservicessolstoneappandusecan": {
    resourceKey: "m6163636f756e742e636865636b6f75742e686f77746f656e6469747369676e696e61747365727669636573736f6c73746f6e65617070616e6475736563616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.itcontinuesuntilyouenditserviceisasubscription": {
    resourceKey: "m6163636f756e742e636865636b6f75742e6974636f6e74696e756573756e74696c796f75656e64697473657276696365697361737562736372697074696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.onthispage": {
    resourceKey: "m6163636f756e742e636865636b6f75742e6f6e7468697370616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.onyourservicepagethere": {
    resourceKey: "m6163636f756e742e636865636b6f75742e6f6e796f757273657276696365706167657468657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.renewalremindersannual60to70daysandagain35to40": {
    resourceKey: "m6163636f756e742e636865636b6f75742e72656e6577616c72656d696e64657273616e6e75616c3630746f373064617973616e64616761696e3335746f3430",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.thedetailsareinthetermswitheverythingelseservi": {
    resourceKey: "m6163636f756e742e636865636b6f75742e74686564657461696c73617265696e7468657465726d737769746865766572797468696e67656c73657365727669",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.thekeyfacts": {
    resourceKey: "m6163636f756e742e636865636b6f75742e7468656b65796661637473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.theleastyoullpayispriceforthefirstintervalunle": {
    resourceKey: "m6163636f756e742e636865636b6f75742e7468656c65617374796f756c6c70617969737072696365666f727468656669727374696e74657276616c756e6c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.whatyoupaypriceeveryintervaltaxincludedannualt": {
    resourceKey: "m6163636f756e742e636865636b6f75742e77686174796f7570617970726963656576657279696e74657276616c746178696e636c75646564616e6e75616c74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.youcanalsowithdrawforafullrefundwhereveryouliv": {
    resourceKey: "m6163636f756e742e636865636b6f75742e796f7563616e616c736f7769746864726177666f726166756c6c726566756e647768657265766572796f756c6976",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.youcanalsowithdrawforfullrefund": {
    resourceKey: "m6163636f756e742e636865636b6f75742e796f7563616e616c736f7769746864726177666f7266756c6c726566756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.youcanchangeyourmindyoucanwithdrawforafullrefu": {
    resourceKey: "m6163636f756e742e636865636b6f75742e796f7563616e6368616e6765796f75726d696e64796f7563616e7769746864726177666f726166756c6c72656675",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.checkout.yourplancoversonejournalandevery": {
    resourceKey: "m6163636f756e742e636865636b6f75742e796f7572706c616e636f766572736f6e656a6f75726e616c616e646576657279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.credentialchange.emailverifiednowverifyyourpasskeytoo": {
    resourceKey: "m6163636f756e742e63726564656e7469616c6368616e67652e656d61696c76657269666965646e6f77766572696679796f7572706173736b6579746f6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.credentialchange.passkeycouldntbeverified": {
    resourceKey: "m6163636f756e742e63726564656e7469616c6368616e67652e706173736b6579636f756c646e7462657665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.credentialchange.passkeyverificationcouldnotstart": {
    resourceKey: "m6163636f756e742e63726564656e7469616c6368616e67652e706173736b6579766572696669636174696f6e636f756c646e6f747374617274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.averifiedemailisrequiredtocontinue": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e617665726966696564656d61696c69737265717569726564746f636f6e74696e7565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.back": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6261636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.closemysignin": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636c6f73656d797369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.closeyoursigninandservices": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636c6f7365796f75727369676e696e616e647365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.closeyoursigninandservices2": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636c6f7365796f75727369676e696e616e64736572766963657332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.closingyoursignin": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636c6f73696e67796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.closingyoursignin2": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636c6f73696e67796f75727369676e696e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.closingyoursignindoesnttouch": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636c6f73696e67796f75727369676e696e646f65736e74746f756368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.codeconfirmed": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636f6465636f6e6669726d6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.codeexpiresin10minutes": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636f646565787069726573696e31306d696e75746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.codesent": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636f646573656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.codesent2": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636f646573656e7432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.confirmitsyou": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636f6e6669726d697473796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.confirmitsyouwithfreshcode": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636f6e6669726d697473796f75776974686672657368636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.confirmwithbothyouremailcodeand": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636f6e6669726d77697468626f7468796f7572656d61696c636f6465616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.confirmwithyouremailcodecontinue": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636f6e6669726d77697468796f7572656d61696c636f6465636f6e74696e7565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.confirmwithyourpasskey": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e636f6e6669726d77697468796f7572706173736b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.datatransparency": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e646174617472616e73706172656e6379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.datatransparency2": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e646174617472616e73706172656e637932",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.downloadwhatsolpbcholds": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e646f776e6c6f616477686174736f6c706263686f6c6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.entercodewejustemailedyou": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e656e746572636f646577656a757374656d61696c6564796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.fromthemomentyouconfirmyouhave72hourstochangey": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e66726f6d7468656d6f6d656e74796f75636f6e6669726d796f75686176653732686f757273746f6368616e676579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.ifsolpbcrunsyourencryptedbackup": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6966736f6c70626372756e73796f7572656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.ifsubscriptionwasduerenewwhileyour": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6966737562736372697074696f6e77617364756572656e65777768696c65796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.ifyoudidntaskforthis": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6966796f756469646e7461736b666f7274686973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.ifyoupayforaservicenothingrenewswhileyoursigni": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6966796f75706179666f7261736572766963656e6f7468696e6772656e6577737768696c65796f75727369676e69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.ifyoupayforservicenothingrenews": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6966796f75706179666f72736572766963656e6f7468696e6772656e657773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.ifyousetuppasskeyconfirmwith": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6966796f757365747570706173736b6579636f6e6669726d77697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.itexpiresin10minutesafteryou": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e697465787069726573696e31306d696e757465736166746572796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.journalonyourdevicesisnttouched": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6a6f75726e616c6f6e796f75726465766963657369736e74746f7563686564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.keepmysignin": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6b6565706d797369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.keepyoursignin": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6b656570796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.keepyoursigninconfirmits": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6b656570796f75727369676e696e636f6e6669726d697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.n6digitcode": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6e366469676974636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.n6digitcode2": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6e366469676974636f646532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.noactivepasskey": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6e6f616374697665706173736b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.noactivepasskey2": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e6e6f616374697665706173736b657932",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.passkeyproofcouldnotbeverified": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e706173736b657970726f6f66636f756c646e6f7462657665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.passkeyproofcouldnotstart": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e706173736b657970726f6f66636f756c646e6f747374617274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.pleasetryagainlater": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e706c65617365747279616761696e6c61746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.sendcode": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e73656e64636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.sendconfirmationcode": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e73656e64636f6e6669726d6174696f6e636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.solpbcisdeletingwhatitheld": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e736f6c706263697364656c6574696e6777686174697468656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.thatcodeisinvalidorexpired": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e74686174636f64656973696e76616c69646f7265787069726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.thatcodeisinvalidorexpired2": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e74686174636f64656973696e76616c69646f726578706972656432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.thatdidntgothroughgoback": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e746861746469646e74676f7468726f756768676f6261636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.thatrequestdidntgothroughgo": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e74686174726571756573746469646e74676f7468726f756768676f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.thereisproblem": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e7468657265697370726f626c656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.thisendseveryserviceonyoursign": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e74686973656e64736576657279736572766963656f6e796f75727369676e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.thisistakinglongerthanusualsol": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e74686973697374616b696e676c6f6e6765727468616e757375616c736f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.thisstatuslinkhasexpired": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e746869737374617475736c696e6b68617365787069726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.toomanytriespleasewaitwhileand": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e746f6f6d616e797472696573706c65617365776169747768696c65616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.useyourpasskey": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e757365796f7572706173736b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.verifiedemailisrequiredcontinue": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e7665726966696564656d61696c69737265717569726564636f6e74696e7565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.verifycode": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e766572696679636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.wecantshowwherethisstands": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e776563616e7473686f777768657265746869737374616e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.whatsolpbcdeletesandfewthings": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e77686174736f6c70626364656c65746573616e646665777468696e6773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.youaskedcloseyoursigninat": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f7561736b6564636c6f7365796f75727369676e696e6174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.youaskedkeepyoursigninat": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f7561736b65646b656570796f75727369676e696e6174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.youkeptyoursigninandsol": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f756b657074796f75727369676e696e616e64736f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.yourrequestcantbeconfirmedright": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f75727265717565737463616e746265636f6e6669726d65647269676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.yourrequestcantbeconfirmedright2": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f75727265717565737463616e746265636f6e6669726d6564726967687432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.yourrequestwentthroughbutthispage": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f75727265717565737477656e747468726f7567686275747468697370616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.yourservicesarestoppingandyoursigninclosesatun": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f7572736572766963657361726573746f7070696e67616e64796f75727369676e696e636c6f7365736174756e",
    formatIntent: "text",
    arguments: [
      { name: "deadline", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.deletion.yoursignin": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.yoursignin2": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f75727369676e696e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.yoursigninclosesatuntilthenyoucanchangeyourmin": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f75727369676e696e636c6f7365736174756e74696c7468656e796f7563616e6368616e6765796f75726d696e",
    formatIntent: "text",
    arguments: [
      { name: "deadline", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.deletion.yoursigninisclosedandsol": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f75727369676e696e6973636c6f736564616e64736f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.deletion.youvealreadyaskedcloseyoursign": {
    resourceKey: "m6163636f756e742e64656c6574696f6e2e796f757665616c726561647961736b6564636c6f7365796f75727369676e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.email.backemailaddresses": {
    resourceKey: "m6163636f756e742e656d61696c2e6261636b656d61696c616464726573736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.email.cannotremovethisemailyoursignin": {
    resourceKey: "m6163636f756e742e656d61696c2e63616e6e6f7472656d6f766574686973656d61696c796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.email.codeexpiredrequestnewone": {
    resourceKey: "m6163636f756e742e656d61696c2e636f646565787069726564726571756573746e65776f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.email.codeexpiresinhour": {
    resourceKey: "m6163636f756e742e656d61696c2e636f646565787069726573696e686f7572",
    formatIntent: "cardinal",
    selectorVar: "count",
    arguments: [
      { name: "count", type: "cardinal", min: 0, max: 2147483647, numericStyle: "ungrouped" },
    ],
  },
  "account.email.codeexpiresinminute": {
    resourceKey: "m6163636f756e742e656d61696c2e636f646565787069726573696e6d696e757465",
    formatIntent: "cardinal",
    selectorVar: "count",
    arguments: [
      { name: "count", type: "cardinal", min: 0, max: 2147483647, numericStyle: "ungrouped" },
    ],
  },
  "account.email.enteremailaddressand6digitcode": {
    resourceKey: "m6163636f756e742e656d61696c2e656e746572656d61696c61646472657373616e64366469676974636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.email.entervalidemailaddress": {
    resourceKey: "m6163636f756e742e656d61696c2e656e74657276616c6964656d61696c61646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.email.thisemailisalreadyverifiedforyour": {
    resourceKey: "m6163636f756e742e656d61696c2e74686973656d61696c6973616c72656164797665726966696564666f72796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.email.verifyemail": {
    resourceKey: "m6163636f756e742e656d61696c2e766572696679656d61696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.added": {
    resourceKey: "m6163636f756e742e656d61696c732e6164646564",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.emails.codeexpiresinlessthan1minute": {
    resourceKey: "m6163636f756e742e656d61696c732e636f646565787069726573696e6c6573737468616e316d696e757465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.email": {
    resourceKey: "m6163636f756e742e656d61696c732e656d61696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.emailaddresses": {
    resourceKey: "m6163636f756e742e656d61696c732e656d61696c616464726573736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.enteritbelow": {
    resourceKey: "m6163636f756e742e656d61696c732e656e746572697462656c6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.n6digitcode": {
    resourceKey: "m6163636f756e742e656d61696c732e6e366469676974636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.primary": {
    resourceKey: "m6163636f756e742e656d61696c732e7072696d617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.remove": {
    resourceKey: "m6163636f756e742e656d61696c732e72656d6f7665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.unverified": {
    resourceKey: "m6163636f756e742e656d61696c732e756e7665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.verified": {
    resourceKey: "m6163636f756e742e656d61696c732e7665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.verify": {
    resourceKey: "m6163636f756e742e656d61696c732e766572696679",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.wesentacodeto": {
    resourceKey: "m6163636f756e742e656d61696c732e776573656e7461636f6465746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.emails.yoursignin": {
    resourceKey: "m6163636f756e742e656d61696c732e796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.beforeanythingissentyourjournalchecks": {
    resourceKey: "m6163636f756e742e656e61626c652e6265666f7265616e797468696e67697373656e74796f75726a6f75726e616c636865636b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.confidentialprocessing": {
    resourceKey: "m6163636f756e742e656e61626c652e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.confidentialprocessingisavailableapprovedscoutsyou": {
    resourceKey: "m6163636f756e742e656e61626c652e636f6e666964656e7469616c70726f63657373696e676973617661696c61626c65617070726f76656473636f757473796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.confidentialprocessingneedsanactivesubscriptionbef": {
    resourceKey: "m6163636f756e742e656e61626c652e636f6e666964656e7469616c70726f63657373696e676e65656473616e616374697665737562736372697074696f6e626566",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.confidentialprocessingsendsyourthinkingoffyour": {
    resourceKey: "m6163636f756e742e656e61626c652e636f6e666964656e7469616c70726f63657373696e6773656e6473796f75727468696e6b696e676f6666796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.continuewithscout": {
    resourceKey: "m6163636f756e742e656e61626c652e636f6e74696e75657769746873636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.encryptedbackup": {
    resourceKey: "m6163636f756e742e656e61626c652e656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.encryptedbackupisoff": {
    resourceKey: "m6163636f756e742e656e61626c652e656e637279707465646261636b757069736f6666",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.gobackyourjournalcheckthatit": {
    resourceKey: "m6163636f756e742e656e61626c652e676f6261636b796f75726a6f75726e616c636865636b746861746974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.ifyougotherefromyourjournal": {
    resourceKey: "m6163636f756e742e656e61626c652e6966796f75676f746865726566726f6d796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.ifyouhavemorethanoneway": {
    resourceKey: "m6163636f756e742e656e61626c652e6966796f75686176656d6f72657468616e6f6e65776179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.ifyourjournalstoppedwaitingturnconfidential": {
    resourceKey: "m6163636f756e742e656e61626c652e6966796f75726a6f75726e616c73746f7070656477616974696e677475726e636f6e666964656e7469616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.ifyourjournalstoppedwaitingturnprivate": {
    resourceKey: "m6163636f756e742e656e61626c652e6966796f75726a6f75726e616c73746f7070656477616974696e677475726e70726976617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.iunderstandthatpublicrecordthisaddress": {
    resourceKey: "m6163636f756e742e656e61626c652e69756e6465727374616e64746861747075626c69637265636f72647468697361646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.iunderstandwhatthissendsandthat": {
    resourceKey: "m6163636f756e742e656e61626c652e69756e6465727374616e64776861747468697373656e6473616e6474686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.moveyoursubscriptionthisjournalreleaseother": {
    resourceKey: "m6163636f756e742e656e61626c652e6d6f7665796f7572737562736372697074696f6e746869736a6f75726e616c72656c656173656f74686572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.nothingisselectedyet": {
    resourceKey: "m6163636f756e742e656e61626c652e6e6f7468696e67697373656c6563746564796574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.onesubscriptioncoversonejournalandyours": {
    resourceKey: "m6163636f756e742e656e61626c652e6f6e65737562736372697074696f6e636f766572736f6e656a6f75726e616c616e64796f757273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.onlyonejournalattimecanback": {
    resourceKey: "m6163636f756e742e656e61626c652e6f6e6c796f6e656a6f75726e616c617474696d6563616e6261636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.openscout": {
    resourceKey: "m6163636f756e742e656e61626c652e6f70656e73636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.privatenetworkneedsanactivesubscriptionbefore": {
    resourceKey: "m6163636f756e742e656e61626c652e707269766174656e6574776f726b6e65656473616e616374697665737562736372697074696f6e6265666f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.publicrecordispermanent": {
    resourceKey: "m6163636f756e742e656e61626c652e7075626c69637265636f726469737065726d616e656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.relaycantreadwhatpassesthrough": {
    resourceKey: "m6163636f756e742e656e61626c652e72656c617963616e7472656164776861747061737365737468726f756768",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.requestscoutaccess": {
    resourceKey: "m6163636f756e742e656e61626c652e7265717565737473636f7574616363657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.requestscoutaccessorreviewyourscout": {
    resourceKey: "m6163636f756e742e656e61626c652e7265717565737473636f75746163636573736f72726576696577796f757273636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.restorefromencryptedbackup": {
    resourceKey: "m6163636f756e742e656e61626c652e726573746f726566726f6d656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.scoutapprovalrequired": {
    resourceKey: "m6163636f756e742e656e61626c652e73636f7574617070726f76616c7265717569726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.scoutistesterprogramapprovedscoutscan": {
    resourceKey: "m6163636f756e742e656e61626c652e73636f7574697374657374657270726f6772616d617070726f76656473636f75747363616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.seeyoursubscription": {
    resourceKey: "m6163636f756e742e656e61626c652e736565796f7572737562736372697074696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.solpbcdeletedanencryptedcopy": {
    resourceKey: "m6163636f756e742e656e61626c652e736f6c70626364656c65746564616e656e63727970746564636f7079",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.solpbcisntholdinganencrypted": {
    resourceKey: "m6163636f756e742e656e61626c652e736f6c70626369736e74686f6c64696e67616e656e63727970746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.solpbcisstillholdinganencrypted": {
    resourceKey: "m6163636f756e742e656e61626c652e736f6c70626369737374696c6c686f6c64696e67616e656e63727970746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.solpbckeepscopyyourjournalencrypted": {
    resourceKey: "m6163636f756e742e656e61626c652e736f6c7062636b65657073636f7079796f75726a6f75726e616c656e63727970746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.solpbcreceivedrestorerequestforyour": {
    resourceKey: "m6163636f756e742e656e61626c652e736f6c7062637265636569766564726573746f726572657175657374666f72796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.solpbcreceivedrestorerequestforyour2": {
    resourceKey: "m6163636f756e742e656e61626c652e736f6c7062637265636569766564726573746f726572657175657374666f72796f757232",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.solpbcrunsrelaysoyourjournal": {
    resourceKey: "m6163636f756e742e656e61626c652e736f6c70626372756e7372656c6179736f796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.somethingdidntlookrightwiththat": {
    resourceKey: "m6163636f756e742e656e61626c652e736f6d657468696e676469646e746c6f6f6b72696768747769746874686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.subscriptionisneeded": {
    resourceKey: "m6163636f756e742e656e61626c652e737562736372697074696f6e69736e6565646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.turnencryptedbackupbackon": {
    resourceKey: "m6163636f756e742e656e61626c652e7475726e656e637279707465646261636b75706261636b6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.turningthisoffkeepsaddressturningit": {
    resourceKey: "m6163636f756e742e656e61626c652e7475726e696e67746869736f66666b65657073616464726573737475726e696e676974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.turnonconfidentialprocessing": {
    resourceKey: "m6163636f756e742e656e61626c652e7475726e6f6e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.turnonencryptedbackup": {
    resourceKey: "m6163636f756e742e656e61626c652e7475726e6f6e656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.turnonprivatenetwork": {
    resourceKey: "m6163636f756e742e656e61626c652e7475726e6f6e707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.turnonsolstoneme": {
    resourceKey: "m6163636f756e742e656e61626c652e7475726e6f6e736f6c73746f6e656d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.whatanagentgets": {
    resourceKey: "m6163636f756e742e656e61626c652e77686174616e6167656e7467657473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.whatitdoesforyourjournal": {
    resourceKey: "m6163636f756e742e656e61626c652e776861746974646f6573666f72796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.whatleavesyourdevice": {
    resourceKey: "m6163636f756e742e656e61626c652e776861746c6561766573796f7572646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.youchoosewhatitmayseeyour": {
    resourceKey: "m6163636f756e742e656e61626c652e796f7563686f6f73657768617469746d6179736565796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.yourjournalmustverifybeforeitsends": {
    resourceKey: "m6163636f756e742e656e61626c652e796f75726a6f75726e616c6d7573747665726966796265666f7265697473656e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.enable.yoursubscriptioncoversanotherjournal": {
    resourceKey: "m6163636f756e742e656e61626c652e796f7572737562736372697074696f6e636f76657273616e6f746865726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.afterrequestclosesonlyitsidentifierdates": {
    resourceKey: "m6163636f756e742e6578706f72742e616674657272657175657374636c6f7365736f6e6c796974736964656e7469666965726461746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.closedsupportrequestscouldnotberead": {
    resourceKey: "m6163636f756e742e6578706f72742e636c6f736564737570706f72747265717565737473636f756c646e6f74626572656164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.emailverificationcouldntstart": {
    resourceKey: "m6163636f756e742e6578706f72742e656d61696c766572696669636174696f6e636f756c646e747374617274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.emailverified": {
    resourceKey: "m6163636f756e742e6578706f72742e656d61696c7665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.oneormoreverifiedemailaddressescould": {
    resourceKey: "m6163636f756e742e6578706f72742e6f6e656f726d6f72657665726966696564656d61696c616464726573736573636f756c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.passkeyverificationcouldntstart": {
    resourceKey: "m6163636f756e742e6578706f72742e706173736b6579766572696669636174696f6e636f756c646e747374617274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.returnedrecorddidnotmatchrequestedrecord": {
    resourceKey: "m6163636f756e742e6578706f72742e72657475726e65647265636f72646469646e6f746d617463687265717565737465647265636f7264",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.serviceunavailable": {
    resourceKey: "m6163636f756e742e6578706f72742e73657276696365756e617661696c61626c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.someprivatenetworkorconfidentialprocessingdetails": {
    resourceKey: "m6163636f756e742e6578706f72742e736f6d65707269766174656e6574776f726b6f72636f6e666964656e7469616c70726f63657373696e6764657461696c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.supportrequestchangedwhilethisdownloadwas": {
    resourceKey: "m6163636f756e742e6578706f72742e737570706f7274726571756573746368616e6765647768696c6574686973646f776e6c6f6164776173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thisdownloadrequestisntvalid": {
    resourceKey: "m6163636f756e742e6578706f72742e74686973646f776e6c6f61647265717565737469736e7476616c6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thissectioncouldnotbeincluded": {
    resourceKey: "m6163636f756e742e6578706f72742e7468697373656374696f6e636f756c646e6f746265696e636c75646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thissectioncouldnotbeincludedcompletely": {
    resourceKey: "m6163636f756e742e6578706f72742e7468697373656374696f6e636f756c646e6f746265696e636c75646564636f6d706c6574656c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thissectioncouldnotbereached": {
    resourceKey: "m6163636f756e742e6578706f72742e7468697373656374696f6e636f756c646e6f74626572656163686564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thissectioncouldnotbereachedin": {
    resourceKey: "m6163636f756e742e6578706f72742e7468697373656374696f6e636f756c646e6f74626572656163686564696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thissectionisnotconnectedrightnow": {
    resourceKey: "m6163636f756e742e6578706f72742e7468697373656374696f6e69736e6f74636f6e6e656374656472696768746e6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thissectionreturnedanunexpectedresponse": {
    resourceKey: "m6163636f756e742e6578706f72742e7468697373656374696f6e72657475726e6564616e756e6578706563746564726573706f6e7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thissectionreturnedanunreadableresponse": {
    resourceKey: "m6163636f756e742e6578706f72742e7468697373656374696f6e72657475726e6564616e756e7265616461626c65726573706f6e7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thissectionreturnedconflictingrecords": {
    resourceKey: "m6163636f756e742e6578706f72742e7468697373656374696f6e72657475726e6564636f6e666c696374696e677265636f726473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.thissectionwastoolargeincludesafely": {
    resourceKey: "m6163636f756e742e6578706f72742e7468697373656374696f6e776173746f6f6c61726765696e636c756465736166656c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.export.toomanyverificationattemptstryagainlater": {
    resourceKey: "m6163636f756e742e6578706f72742e746f6f6d616e79766572696669636174696f6e617474656d707473747279616761696e6c61746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.head.updaterefused": {
    resourceKey: "m6163636f756e742e686561642e75706461746572656675736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.closing": {
    resourceKey: "m6163636f756e742e6d61696c2e636c6f73696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.confirmyourdownloadfromsolstoneservices": {
    resourceKey: "m6163636f756e742e6d61696c2e636f6e6669726d796f7572646f776e6c6f616466726f6d736f6c73746f6e657365727669636573",
    formatIntent: "text",
    arguments: [
      { name: "code", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.mail.confirmyoursignin": {
    resourceKey: "m6163636f756e742e6d61696c2e636f6e6669726d796f75727369676e696e",
    formatIntent: "text",
    arguments: [
      { name: "action", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "code", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.mail.enterthiscodetocontinue": {
    resourceKey: "m6163636f756e742e6d61696c2e656e74657274686973636f6465746f636f6e74696e7565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.ifyoudidnotrequestthisyoucanignorethisemail": {
    resourceKey: "m6163636f756e742e6d61696c2e6966796f756469646e6f747265717565737474686973796f7563616e69676e6f726574686973656d61696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.ifyoudidntrequestthisyoucanignorethisemail": {
    resourceKey: "m6163636f756e742e6d61696c2e6966796f756469646e747265717565737474686973796f7563616e69676e6f726574686973656d61696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.itexpiresin10minutes": {
    resourceKey: "m6163636f756e742e6d61696c2e697465787069726573696e31306d696e75746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.itexpiresin10minutes2": {
    resourceKey: "m6163636f756e742e6d61696c2e697465787069726573696e31306d696e7574657332",
    formatIntent: "text",
    arguments: [
      { name: "deadlineNotice", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.mail.keeping": {
    resourceKey: "m6163636f756e742e6d61696c2e6b656570696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.toverifythisemailaddressforyoursolpbcsigninent": {
    resourceKey: "m6163636f756e742e6d61696c2e746f76657269667974686973656d61696c61646472657373666f72796f7572736f6c7062637369676e696e656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.verifyachangetoyoursignin": {
    resourceKey: "m6163636f756e742e6d61696c2e766572696679616368616e6765746f796f75727369676e696e",
    formatIntent: "text",
    arguments: [
      { name: "code", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.mail.verifyyoursolpbcemail": {
    resourceKey: "m6163636f756e742e6d61696c2e766572696679796f7572736f6c706263656d61696c",
    formatIntent: "text",
    arguments: [
      { name: "code", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.mail.yourequestedachangetoyourpasskeysoremailaddres": {
    resourceKey: "m6163636f756e742e6d61696c2e796f75726571756573746564616368616e6765746f796f7572706173736b6579736f72656d61696c616464726573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.yourequestedacopyofthedataheldwithyoursolstone": {
    resourceKey: "m6163636f756e742e6d61696c2e796f7572657175657374656461636f70796f667468656461746168656c6477697468796f7572736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.mail.yoursigninclosesatunlessyouconfirmbeforethen": {
    resourceKey: "m6163636f756e742e6d61696c2e796f75727369676e696e636c6f7365736174756e6c657373796f75636f6e6669726d6265666f72657468656e",
    formatIntent: "text",
    arguments: [
      { name: "deadline", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.mail.yoursolpbcsignincode": {
    resourceKey: "m6163636f756e742e6d61696c2e796f7572736f6c7062637369676e696e636f6465",
    formatIntent: "text",
    arguments: [
      { name: "code", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.mail.yoursolpbcsignincodeis": {
    resourceKey: "m6163636f756e742e6d61696c2e796f7572736f6c7062637369676e696e636f64656973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexport.averifiedemailisrequiredtocontinue": {
    resourceKey: "m6163636f756e742e6f776e65726578706f72742e617665726966696564656d61696c69737265717569726564746f636f6e74696e7565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexport.codesent": {
    resourceKey: "m6163636f756e742e6f776e65726578706f72742e636f646573656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexport.noactivepasskey": {
    resourceKey: "m6163636f756e742e6f776e65726578706f72742e6e6f616374697665706173736b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexport.passkeycouldntbeverified": {
    resourceKey: "m6163636f756e742e6f776e65726578706f72742e706173736b6579636f756c646e7462657665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexport.thatcodeisinvalidorexpired": {
    resourceKey: "m6163636f756e742e6f776e65726578706f72742e74686174636f64656973696e76616c69646f7265787069726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexportpath.notfound": {
    resourceKey: "m6163636f756e742e6f776e65726578706f7274706174682e6e6f74666f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexportretained.encryptedbackupcontentsarenotreadablehere": {
    resourceKey: "m6163636f756e742e6f776e65726578706f727472657461696e65642e656e637279707465646261636b7570636f6e74656e74736172656e6f747265616461626c6568657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexportretained.supportrequestssentwithoutanemailaddress": {
    resourceKey: "m6163636f756e742e6f776e65726578706f727472657461696e65642e737570706f7274726571756573747373656e74776974686f7574616e656d61696c61646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexportretained.yourjournalcontentsstayinyourjournal": {
    resourceKey: "m6163636f756e742e6f776e65726578706f727472657461696e65642e796f75726a6f75726e616c636f6e74656e747373746179696e796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.ownerexportretained.yourreceiptsandpastchargesareheld": {
    resourceKey: "m6163636f756e742e6f776e65726578706f727472657461696e65642e796f75727265636569707473616e64706173746368617267657361726568656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.addpasskey": {
    resourceKey: "m6163636f756e742e706173736b65792e616464706173736b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.challengeexpiredorinvalid": {
    resourceKey: "m6163636f756e742e706173736b65792e6368616c6c656e6765657870697265646f72696e76616c6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.devicename": {
    resourceKey: "m6163636f756e742e706173736b65792e6465766963656e616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.devicenameoptional": {
    resourceKey: "m6163636f756e742e706173736b65792e6465766963656e616d656f7074696f6e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.howyousigninyoucanhave": {
    resourceKey: "m6163636f756e742e706173736b65792e686f77796f757369676e696e796f7563616e68617665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.invalidbody": {
    resourceKey: "m6163636f756e742e706173736b65792e696e76616c6964626f6479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.invalidclientdata": {
    resourceKey: "m6163636f756e742e706173736b65792e696e76616c6964636c69656e7464617461",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.invalidrequest": {
    resourceKey: "m6163636f756e742e706173736b65792e696e76616c696472657175657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.methodnotallowed": {
    resourceKey: "m6163636f756e742e706173736b65792e6d6574686f646e6f74616c6c6f776564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.neverused": {
    resourceKey: "m6163636f756e742e706173736b65792e6e6576657275736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.nopasskeysenrollednexttimeyousign": {
    resourceKey: "m6163636f756e742e706173736b65792e6e6f706173736b657973656e726f6c6c65646e65787474696d65796f757369676e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.passkeyalreadyregistered": {
    resourceKey: "m6163636f756e742e706173736b65792e706173736b6579616c726561647972656769737465726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.registrationcouldnotbeverified": {
    resourceKey: "m6163636f756e742e706173736b65792e726567697374726174696f6e636f756c646e6f7462657665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.responserequired": {
    resourceKey: "m6163636f756e742e706173736b65792e726573706f6e73657265717569726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.signinfailed": {
    resourceKey: "m6163636f756e742e706173736b65792e7369676e696e6661696c6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.signinrequired": {
    resourceKey: "m6163636f756e742e706173736b65792e7369676e696e7265717569726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.toomanyattemptstryagainlater": {
    resourceKey: "m6163636f756e742e706173736b65792e746f6f6d616e79617474656d707473747279616761696e6c61746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkey.verifyitsyoubeforethischange": {
    resourceKey: "m6163636f756e742e706173736b65792e766572696679697473796f756265666f7265746869736368616e6765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeyenroll.couldntaddpasskeytryagain2": {
    resourceKey: "m6163636f756e742e706173736b6579656e726f6c6c2e636f756c646e74616464706173736b6579747279616761696e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeylanding.passkeysigninfaileduseyouremailinstead": {
    resourceKey: "m6163636f756e742e706173736b65796c616e64696e672e706173736b65797369676e696e6661696c6564757365796f7572656d61696c696e7374656164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeys.addapasskey": {
    resourceKey: "m6163636f756e742e706173736b6579732e61646461706173736b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeys.devicename": {
    resourceKey: "m6163636f756e742e706173736b6579732e6465766963656e616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeys.devicenameoptional": {
    resourceKey: "m6163636f756e742e706173736b6579732e6465766963656e616d656f7074696f6e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeys.passkeyrequestfailed": {
    resourceKey: "m6163636f756e742e706173736b6579732e706173736b6579726571756573746661696c6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeys.passkeys": {
    resourceKey: "m6163636f756e742e706173736b6579732e706173736b657973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeys.remove": {
    resourceKey: "m6163636f756e742e706173736b6579732e72656d6f7665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeys.rename": {
    resourceKey: "m6163636f756e742e706173736b6579732e72656e616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeys.toomanyattemptstryagainlater": {
    resourceKey: "m6163636f756e742e706173736b6579732e746f6f6d616e79617474656d707473747279616761696e6c61746572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.passkeys.yoursignin": {
    resourceKey: "m6163636f756e742e706173736b6579732e796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.accountreplaced": {
    resourceKey: "m6163636f756e742e706f7274616c2e6163636f756e747265706c61636564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.active": {
    resourceKey: "m6163636f756e742e706f7274616c2e616374697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.addressispubliconceitsissued": {
    resourceKey: "m6163636f756e742e706f7274616c2e6164647265737369737075626c69636f6e6365697473697373756564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.all": {
    resourceKey: "m6163636f756e742e706f7274616c2e616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.arein": {
    resourceKey: "m6163636f756e742e706f7274616c2e617265696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.article8ofourarticlesofincorporation": {
    resourceKey: "m6163636f756e742e706f7274616c2e61727469636c65386f666f757261727469636c65736f66696e636f72706f726174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.articleiiiofthebylaws": {
    resourceKey: "m6163636f756e742e706f7274616c2e61727469636c656969696f6674686562796c617773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.asoffturn": {
    resourceKey: "m6163636f756e742e706f7274616c2e61736f66667475726e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.attheendofthisplanyear": {
    resourceKey: "m6163636f756e742e706f7274616c2e6174746865656e646f6674686973706c616e79656172",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.audio": {
    resourceKey: "m6163636f756e742e706f7274616c2e617564696f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.back": {
    resourceKey: "m6163636f756e742e706f7274616c2e6261636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.bytes2": {
    resourceKey: "m6163636f756e742e706f7274616c2e627974657332",
    formatIntent: "text",
    arguments: [
      { name: "value1", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.byturningthisonyouagreetothe": {
    resourceKey: "m6163636f756e742e706f7274616c2e62797475726e696e67746869736f6e796f756167726565746f746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.cancel": {
    resourceKey: "m6163636f756e742e706f7274616c2e63616e63656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.cancelforaseriousreasonsuchassomethingwedidwro": {
    resourceKey: "m6163636f756e742e706f7274616c2e63616e63656c666f7261736572696f7573726561736f6e737563686173736f6d657468696e67776564696477726f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.cancelyoursubscription": {
    resourceKey: "m6163636f756e742e706f7274616c2e63616e63656c796f7572737562736372697074696f6e",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.catchupnotice": {
    resourceKey: "m6163636f756e742e706f7274616c2e636174636875706e6f74696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.ccby40": {
    resourceKey: "m6163636f756e742e706f7274616c2e636362793430",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.confidentialprocessing": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.confidentialprocessingnocontentisretainedno": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e666964656e7469616c70726f63657373696e676e6f636f6e74656e74697372657461696e65646e6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.confirmitsyou": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e6669726d697473796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.confirmitsyoufirstifservice": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e6669726d697473796f756669727374696673657276696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.confirmwithdrawal": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e6669726d7769746864726177616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.confirmyourdownload": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e6669726d796f7572646f776e6c6f6164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.confirmyouunderstandbeforecontinuing": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e6669726d796f75756e6465727374616e646265666f7265636f6e74696e75696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.consentgiven": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e73656e74676976656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.consenttextversion": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e73656e747465787476657273696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.continue": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f6e74696e7565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.couldnotturnon": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f756c646e6f747475726e6f6e",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.couldnotturnon2": {
    resourceKey: "m6163636f756e742e706f7274616c2e636f756c646e6f747475726e6f6e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.datatermsaccepted": {
    resourceKey: "m6163636f756e742e706f7274616c2e646174617465726d736163636570746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.dayago": {
    resourceKey: "m6163636f756e742e706f7274616c2e64617961676f",
    formatIntent: "cardinal",
    selectorVar: "count",
    arguments: [
      { name: "count", type: "cardinal", min: 0, max: 2147483647, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.directlyinanewbrowsertabandrequestanewcode": {
    resourceKey: "m6163636f756e742e706f7274616c2e6469726563746c79696e616e657762726f77736572746162616e6472657175657374616e6577636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.downloadbelowcarrieseachthemsupportrequests": {
    resourceKey: "m6163636f756e742e706f7274616c2e646f776e6c6f616462656c6f7763617272696573656163687468656d737570706f72747265717565737473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.downloadfile": {
    resourceKey: "m6163636f756e742e706f7274616c2e646f776e6c6f616466696c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.downloadwhatsolpbcholdsbeforeyour": {
    resourceKey: "m6163636f756e742e706f7274616c2e646f776e6c6f616477686174736f6c706263686f6c64736265666f7265796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.entercodesentyourverifiedemailaddress": {
    resourceKey: "m6163636f756e742e706f7274616c2e656e746572636f646573656e74796f75727665726966696564656d61696c61646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.eventid": {
    resourceKey: "m6163636f756e742e706f7274616c2e6576656e746964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.filesremoved": {
    resourceKey: "m6163636f756e742e706f7274616c2e66696c657372656d6f766564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.foraseriousreason": {
    resourceKey: "m6163636f756e742e706f7274616c2e666f7261736572696f7573726561736f6e",
    formatIntent: "text",
    arguments: [
      { name: "reason", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.freeasscout": {
    resourceKey: "m6163636f756e742e706f7274616c2e66726565617373636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.fullmessagewesent": {
    resourceKey: "m6163636f756e742e706f7274616c2e66756c6c6d657373616765776573656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.given": {
    resourceKey: "m6163636f756e742e706f7274616c2e676976656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.home": {
    resourceKey: "m6163636f756e742e706f7274616c2e686f6d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.hourago": {
    resourceKey: "m6163636f756e742e706f7274616c2e686f757261676f",
    formatIntent: "cardinal",
    selectorVar: "count",
    arguments: [
      { name: "count", type: "cardinal", min: 0, max: 2147483647, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.hours": {
    resourceKey: "m6163636f756e742e706f7274616c2e686f757273",
    formatIntent: "text",
    arguments: [
      { name: "value1", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.howweearnyourtrust": {
    resourceKey: "m6163636f756e742e706f7274616c2e686f7777656561726e796f75727472757374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.ifyoucameherefromyourjournal": {
    resourceKey: "m6163636f756e742e706f7274616c2e6966796f7563616d656865726566726f6d796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.ifyouhaveanactivepasskeyyou": {
    resourceKey: "m6163636f756e742e706f7274616c2e6966796f7568617665616e616374697665706173736b6579796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.ifyouhaveanactivepasskeyyoumustalsoverifyitbef": {
    resourceKey: "m6163636f756e742e706f7274616c2e6966796f7568617665616e616374697665706173736b6579796f756d757374616c736f7665726966796974626566",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.ifyourjournalstillshows": {
    resourceKey: "m6163636f756e742e706f7274616c2e6966796f75726a6f75726e616c7374696c6c73686f7773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.imaskingsolpbcstartthis": {
    resourceKey: "m6163636f756e742e706f7274616c2e696d61736b696e67736f6c706263737461727474686973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.itendson": {
    resourceKey: "m6163636f756e742e706f7274616c2e6974656e64736f6e",
    formatIntent: "text",
    arguments: [
      { name: "endDate", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.itendsontheearliestanordinarycancelcan": {
    resourceKey: "m6163636f756e742e706f7274616c2e6974656e64736f6e7468656561726c69657374616e6f7264696e61727963616e63656c63616e",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.itendsontheearliestitcan": {
    resourceKey: "m6163636f756e742e706f7274616c2e6974656e64736f6e7468656561726c69657374697463616e",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.itendstodaywellansweryourreasonandwhetherweref": {
    resourceKey: "m6163636f756e742e706f7274616c2e6974656e6473746f64617977656c6c616e73776572796f7572726561736f6e616e64776865746865727765726566",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.itsonefilewhatsheld": {
    resourceKey: "m6163636f756e742e706f7274616c2e6974736f6e6566696c65776861747368656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.iunderstand": {
    resourceKey: "m6163636f756e742e706f7274616c2e69756e6465727374616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.journal": {
    resourceKey: "m6163636f756e742e706f7274616c2e6a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.justnow": {
    resourceKey: "m6163636f756e742e706f7274616c2e6a7573746e6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.keepitsigninagainthenconfirm": {
    resourceKey: "m6163636f756e742e706f7274616c2e6b65657069747369676e696e616761696e7468656e636f6e6669726d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.keepsworkinguntilthenandwerefundwholethesamewa": {
    resourceKey: "m6163636f756e742e706f7274616c2e6b65657073776f726b696e67756e74696c7468656e616e647765726566756e6477686f6c6574686573616d657761",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "months", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "monthsLabel", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "amount", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.keepsworkinguntilthentheendoftheperiodyouvepai": {
    resourceKey: "m6163636f756e742e706f7274616c2e6b65657073776f726b696e67756e74696c7468656e746865656e646f66746865706572696f64796f757665706169",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.lastactive": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c617374616374697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.lastbackupsizeenabled2": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c6173746261636b757073697a65656e61626c656432",
    formatIntent: "text",
    arguments: [
      { name: "relativeTime", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "size", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.lastpaymentdidntgothroughmanage": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c6173747061796d656e746469646e74676f7468726f7567686d616e616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.lastpaymentdidntgothroughmanage2": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c6173747061796d656e746469646e74676f7468726f7567686d616e61676532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.lastpaymentdidntgothroughreaching": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c6173747061796d656e746469646e74676f7468726f7567687265616368696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.lastpaymentdidntgothroughyour": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c6173747061796d656e746469646e74676f7468726f756768796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.lastseen": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c6173747365656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.lastsignin": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c6173747369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.letsencryptaccount": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c657473656e63727970746163636f756e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.linkyouusedmayhaveexpiredor": {
    resourceKey: "m6163636f756e742e706f7274616c2e6c696e6b796f75757365646d617968617665657870697265646f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.menu": {
    resourceKey: "m6163636f756e742e706f7274616c2e6d656e75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.minuteago": {
    resourceKey: "m6163636f756e742e706f7274616c2e6d696e75746561676f",
    formatIntent: "cardinal",
    selectorVar: "count",
    arguments: [
      { name: "count", type: "cardinal", min: 0, max: 2147483647, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.month": {
    resourceKey: "m6163636f756e742e706f7274616c2e6d6f6e7468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.months": {
    resourceKey: "m6163636f756e742e706f7274616c2e6d6f6e746873",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.n6digitcode": {
    resourceKey: "m6163636f756e742e706f7274616c2e6e366469676974636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.n72hoursareupsothiscan": {
    resourceKey: "m6163636f756e742e706f7274616c2e6e3732686f7572736172657570736f7468697363616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.needsanactivesubscriptionbeforeitcanturnonyour": {
    resourceKey: "m6163636f756e742e706f7274616c2e6e65656473616e616374697665737562736372697074696f6e6265666f7265697463616e7475726e6f6e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.newest": {
    resourceKey: "m6163636f756e742e706f7274616c2e6e6577657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.no": {
    resourceKey: "m6163636f756e742e706f7274616c2e6e6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.noanalyticsnobehavioraldatanothirdpartytrackin": {
    resourceKey: "m6163636f756e742e706f7274616c2e6e6f616e616c79746963736e6f6265686176696f72616c646174616e6f74686972647061727479747261636b696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.noticeversion": {
    resourceKey: "m6163636f756e742e706f7274616c2e6e6f7469636576657273696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.of": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.off": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f6666",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.on": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.onagainfromyourjournal": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f6e616761696e66726f6d796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.onagaininyourjournal": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f6e616761696e696e796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.onceyousigninthispagelists": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f6e6365796f757369676e696e74686973706167656c69737473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.oneoffnotice": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f6e656f66666e6f74696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.onesubscriptioncoversonejournalturnit": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f6e65737562736372697074696f6e636f766572736f6e656a6f75726e616c7475726e6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.openyourservices": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f70656e796f75727365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.otherwiseopenservicessolstoneappdirectlyand": {
    resourceKey: "m6163636f756e742e706f7274616c2e6f74686572776973656f70656e7365727669636573736f6c73746f6e656170706469726563746c79616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.paidthrough": {
    resourceKey: "m6163636f756e742e706f7274616c2e706169647468726f756768",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.paidthrough2": {
    resourceKey: "m6163636f756e742e706f7274616c2e706169647468726f75676832",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.paidthroughappstore": {
    resourceKey: "m6163636f756e742e706f7274616c2e706169647468726f75676861707073746f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.paidthroughgoogleplay": {
    resourceKey: "m6163636f756e742e706f7274616c2e706169647468726f756768676f6f676c65706c6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.passkeyproofverified": {
    resourceKey: "m6163636f756e742e706f7274616c2e706173736b657970726f6f667665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.passkeys": {
    resourceKey: "m6163636f756e742e706f7274616c2e706173736b657973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.passkeyverification": {
    resourceKey: "m6163636f756e742e706f7274616c2e706173736b6579766572696669636174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.passkeyverification2": {
    resourceKey: "m6163636f756e742e706f7274616c2e706173736b6579766572696669636174696f6e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.passkeyverified": {
    resourceKey: "m6163636f756e742e706f7274616c2e706173736b65797665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.passkeyverifiedcheckyouremailforacodetoo": {
    resourceKey: "m6163636f756e742e706f7274616c2e706173736b65797665726966696564636865636b796f7572656d61696c666f7261636f6465746f6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.pickupwhereyouleftoff": {
    resourceKey: "m6163636f756e742e706f7274616c2e7069636b75707768657265796f756c6566746f6666",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.privacy": {
    resourceKey: "m6163636f756e742e706f7274616c2e70726976616379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.privacypolicy": {
    resourceKey: "m6163636f756e742e706f7274616c2e70726976616379706f6c696379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.privatenetworkrelay": {
    resourceKey: "m6163636f756e742e706f7274616c2e707269766174656e6574776f726b72656c6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.refusednotanallowedkindaccess": {
    resourceKey: "m6163636f756e742e706f7274616c2e726566757365646e6f74616e616c6c6f7765646b696e64616363657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.refusedservicewasnton": {
    resourceKey: "m6163636f756e742e706f7274616c2e72656675736564736572766963657761736e746f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.relayaccess": {
    resourceKey: "m6163636f756e742e706f7274616c2e72656c6179616363657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.relayaccessuntil": {
    resourceKey: "m6163636f756e742e706f7274616c2e72656c6179616363657373756e74696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.renewalreminder": {
    resourceKey: "m6163636f756e742e706f7274616c2e72656e6577616c72656d696e646572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.renewson": {
    resourceKey: "m6163636f756e742e706f7274616c2e72656e6577736f6e",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.renewsonat": {
    resourceKey: "m6163636f756e742e706f7274616c2e72656e6577736f6e6174",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "price", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "tax", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.requestistiedyoursignin": {
    resourceKey: "m6163636f756e742e706f7274616c2e72657175657374697374696564796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.restated20260501and": {
    resourceKey: "m6163636f756e742e706f7274616c2e72657374617465643230323630353031616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.savethispage": {
    resourceKey: "m6163636f756e742e706f7274616c2e736176657468697370616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.sayswhoelsecanseethemthereandwhy": {
    resourceKey: "m6163636f756e742e706f7274616c2e7361797377686f656c736563616e7365657468656d7468657265616e64776879",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.scoutacknowledgementsaved": {
    resourceKey: "m6163636f756e742e706f7274616c2e73636f757461636b6e6f776c656467656d656e747361766564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.scoutrequestreceived": {
    resourceKey: "m6163636f756e742e706f7274616c2e73636f7574726571756573747265636569766564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.servicesandbilling": {
    resourceKey: "m6163636f756e742e706f7274616c2e7365727669636573616e6462696c6c696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.servicestatus": {
    resourceKey: "m6163636f756e742e706f7274616c2e73657276696365737461747573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.sessions": {
    resourceKey: "m6163636f756e742e706f7274616c2e73657373696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.setup": {
    resourceKey: "m6163636f756e742e706f7274616c2e7365747570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.shown": {
    resourceKey: "m6163636f756e742e706f7274616c2e73686f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.signedin": {
    resourceKey: "m6163636f756e742e706f7274616c2e7369676e6564696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.signedinas": {
    resourceKey: "m6163636f756e742e706f7274616c2e7369676e6564696e6173",
    formatIntent: "text",
    arguments: [
      { name: "email", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.signin": {
    resourceKey: "m6163636f756e742e706f7274616c2e7369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.signinkeepit": {
    resourceKey: "m6163636f756e742e706f7274616c2e7369676e696e6b6565706974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.sizedforonejournalwithcomputerand": {
    resourceKey: "m6163636f756e742e706f7274616c2e73697a6564666f726f6e656a6f75726e616c77697468636f6d7075746572616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.solpbc": {
    resourceKey: "m6163636f756e742e706f7274616c2e736f6c706263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.solpbccanapproveitbecauseit": {
    resourceKey: "m6163636f756e742e706f7274616c2e736f6c70626363616e617070726f76656974626563617573656974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.solpbcreceivedarequesttoturnonforyourjournalit": {
    resourceKey: "m6163636f756e742e706f7274616c2e736f6c70626372656365697665646172657175657374746f7475726e6f6e666f72796f75726a6f75726e616c6974",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.solstoneapp": {
    resourceKey: "m6163636f756e742e706f7274616c2e736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.speechtotextisservedwithparakeettdt06bv3create": {
    resourceKey: "m6163636f756e742e706f7274616c2e737065656368746f74657874697373657276656477697468706172616b6565747464743036627633637265617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.startmyservicenow": {
    resourceKey: "m6163636f756e742e706f7274616c2e73746172746d79736572766963656e6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.stripecustomer": {
    resourceKey: "m6163636f756e742e706f7274616c2e737472697065637573746f6d6572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.subscriptioneveryboughton": {
    resourceKey: "m6163636f756e742e706f7274616c2e737562736372697074696f6e6576657279626f756768746f6e",
    formatIntent: "text",
    arguments: [
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "price", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "interval", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "purchaseDate", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.support": {
    resourceKey: "m6163636f756e742e706f7274616c2e737570706f7274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.tellusthereason": {
    resourceKey: "m6163636f756e742e706f7274616c2e74656c6c7573746865726561736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.terms": {
    resourceKey: "m6163636f756e742e706f7274616c2e7465726d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.thatcodedidntworktryagain": {
    resourceKey: "m6163636f756e742e706f7274616c2e74686174636f64656469646e74776f726b747279616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.thatlinkdidntwork": {
    resourceKey: "m6163636f756e742e706f7274616c2e746861746c696e6b6469646e74776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.thecodeexpiresin10minutes": {
    resourceKey: "m6163636f756e742e706f7274616c2e746865636f646565787069726573696e31306d696e75746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.thecovenants": {
    resourceKey: "m6163636f756e742e706f7274616c2e746865636f76656e616e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.thedownload": {
    resourceKey: "m6163636f756e742e706f7274616c2e746865646f776e6c6f6164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.therelaysrecordforeachofyourjournals": {
    resourceKey: "m6163636f756e742e706f7274616c2e74686572656c6179737265636f7264666f72656163686f66796f75726a6f75726e616c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.thesecouldntbeloadedjustnow": {
    resourceKey: "m6163636f756e742e706f7274616c2e7468657365636f756c646e7462656c6f616465646a7573746e6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.thischangeneedsfreshcodeentercode": {
    resourceKey: "m6163636f756e742e706f7274616c2e746869736368616e67656e656564736672657368636f6465656e746572636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.thispagelistseverykindrecordsol": {
    resourceKey: "m6163636f756e742e706f7274616c2e74686973706167656c6973747365766572796b696e647265636f7264736f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.tocontinueopen": {
    resourceKey: "m6163636f756e742e706f7274616c2e746f636f6e74696e75656f70656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.today": {
    resourceKey: "m6163636f756e742e706f7274616c2e746f646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.turnedon": {
    resourceKey: "m6163636f756e742e706f7274616c2e7475726e65646f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.turningitoffdoesntcancelasubscription": {
    resourceKey: "m6163636f756e742e706f7274616c2e7475726e696e6769746f6666646f65736e7463616e63656c61737562736372697074696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.turnsoffatperiodend": {
    resourceKey: "m6163636f756e742e706f7274616c2e7475726e736f66666174706572696f64656e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.unfinisheduploadscleared": {
    resourceKey: "m6163636f756e742e706f7274616c2e756e66696e697368656475706c6f616473636c6561726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.updateyourjournalonthecomputeritrunsonthenturn": {
    resourceKey: "m6163636f756e742e706f7274616c2e757064617465796f75726a6f75726e616c6f6e746865636f6d7075746572697472756e736f6e7468656e7475726e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.validfor": {
    resourceKey: "m6163636f756e742e706f7274616c2e76616c6964666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.verifycode": {
    resourceKey: "m6163636f756e742e706f7274616c2e766572696679636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.verifywithpasskey": {
    resourceKey: "m6163636f756e742e706f7274616c2e76657269667977697468706173736b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.verifywithpasskey2": {
    resourceKey: "m6163636f756e742e706f7274616c2e76657269667977697468706173736b657932",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.wekeepyourencryptedbackupcopyfor": {
    resourceKey: "m6163636f756e742e706f7274616c2e77656b656570796f7572656e637279707465646261636b7570636f7079666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.wellsendtheconfirmationto": {
    resourceKey: "m6163636f756e742e706f7274616c2e77656c6c73656e64746865636f6e6669726d6174696f6e746f",
    formatIntent: "text",
    arguments: [
      { name: "email", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.weneverholdareadablecopyofyourjournalandwedont": {
    resourceKey: "m6163636f756e742e706f7274616c2e77656e65766572686f6c64617265616461626c65636f70796f66796f75726a6f75726e616c616e647765646f6e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.wereceivedyourcancellationon": {
    resourceKey: "m6163636f756e742e706f7274616c2e77657265636569766564796f757263616e63656c6c6174696f6e6f6e",
    formatIntent: "text",
    arguments: [
      { name: "moment", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.werefund": {
    resourceKey: "m6163636f756e742e706f7274616c2e7765726566756e64",
    formatIntent: "text",
    arguments: [
      { name: "refund", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.werefundthewholemonthslefteitherway": {
    resourceKey: "m6163636f756e742e706f7274616c2e7765726566756e6474686577686f6c656d6f6e7468736c656674656974686572776179",
    formatIntent: "text",
    arguments: [
      { name: "amount", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.weveemailedyouacopy": {
    resourceKey: "m6163636f756e742e706f7274616c2e77657665656d61696c6564796f7561636f7079",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.whatleavesyourdevice": {
    resourceKey: "m6163636f756e742e706f7274616c2e776861746c6561766573796f7572646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.whatsolpbckeepsisinthe": {
    resourceKey: "m6163636f756e742e706f7274616c2e77686174736f6c7062636b656570736973696e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.whatsolpbckeepsisinthe2": {
    resourceKey: "m6163636f756e742e706f7274616c2e77686174736f6c7062636b656570736973696e74686532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.whatwouldyoulikeuseitfor": {
    resourceKey: "m6163636f756e742e706f7274616c2e77686174776f756c64796f756c696b657573656974666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.whatyoutoldusyouduse": {
    resourceKey: "m6163636f756e742e706f7274616c2e77686174796f75746f6c647573796f7564757365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.whereitgoes": {
    resourceKey: "m6163636f756e742e706f7274616c2e77686572656974676f6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.withdrawfromcontracthere": {
    resourceKey: "m6163636f756e742e706f7274616c2e776974686472617766726f6d636f6e747261637468657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.withdrawfromcontracthere2": {
    resourceKey: "m6163636f756e742e706f7274616c2e776974686472617766726f6d636f6e74726163746865726532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.yes": {
    resourceKey: "m6163636f756e742e706f7274616c2e796573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.yesterday": {
    resourceKey: "m6163636f756e742e706f7274616c2e796573746572646179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.youallowed": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f75616c6c6f776564",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.youallowed2": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f75616c6c6f77656432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.youcanturnitofffromthejournalanytime": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f7563616e7475726e69746f666666726f6d7468656a6f75726e616c616e7974696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.youneverhavepayusyourjournal": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f756e65766572686176657061797573796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.yourecancelingevery": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f75726563616e63656c696e676576657279",
    formatIntent: "text",
    arguments: [
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "price", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "interval", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.portal.yourjournalisalwaysprivateonlyyours": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f75726a6f75726e616c6973616c77617973707269766174656f6e6c79796f757273",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.yourjournalneedsanupdatebeforeit": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f75726a6f75726e616c6e65656473616e7570646174656265666f72656974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.yourjournalneedsanupdatebeforeitcanturnthison": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f75726a6f75726e616c6e65656473616e7570646174656265666f7265697463616e7475726e746869736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.yournameoptionalitgoesonlyintoyourconfirmation": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f75726e616d656f7074696f6e616c6974676f65736f6e6c79696e746f796f7572636f6e6669726d6174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.yourservices": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f75727365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.yourservicesstopassoonasyou": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f7572736572766963657373746f706173736f6f6e6173796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.portal.yoursignin": {
    resourceKey: "m6163636f756e742e706f7274616c2e796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.push.youhavenewnotification": {
    resourceKey: "m6163636f756e742e707573682e796f75686176656e65776e6f74696669636174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.address": {
    resourceKey: "m6163636f756e742e72656e6577616c2e61646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.annualeachrenewalgivesyou14moredaystowithdrawc": {
    resourceKey: "m6163636f756e742e72656e6577616c2e616e6e75616c6561636872656e6577616c6769766573796f7531346d6f726564617973746f776974686472617763",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.boughtonpurchasedate": {
    resourceKey: "m6163636f756e742e72656e6577616c2e626f756768746f6e707572636861736564617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.boughtonpurchasedaterenewedonwindowdate": {
    resourceKey: "m6163636f756e742e72656e6577616c2e626f756768746f6e70757263686173656461746572656e657765646f6e77696e646f7764617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.boxtostopitrenewingcancelbycancelbydatebox": {
    resourceKey: "m6163636f756e742e72656e6577616c2e626f78746f73746f70697472656e6577696e6763616e63656c627963616e63656c627964617465626f78",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.cancelingtakesasfewstepsassubscribingdidsignin": {
    resourceKey: "m6163636f756e742e72656e6577616c2e63616e63656c696e6774616b65736173666577737465707361737375627363726962696e676469647369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.confidentialprocessing": {
    resourceKey: "m6163636f756e742e72656e6577616c2e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.date": {
    resourceKey: "m6163636f756e742e72656e6577616c2e64617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.earlywellremindyouagainclosertothedateearlyify": {
    resourceKey: "m6163636f756e742e72656e6577616c2e6561726c7977656c6c72656d696e64796f75616761696e636c6f736572746f746865646174656561726c79696679",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.encryptedbackup": {
    resourceKey: "m6163636f756e742e72656e6577616c2e656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.fromsignedinasprimaryemailandthisconfirmationi": {
    resourceKey: "m6163636f756e742e72656e6577616c2e66726f6d7369676e6564696e61737072696d617279656d61696c616e6474686973636f6e6669726d6174696f6e69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.ifyouusecancelcontractshereinsteadnoworafterth": {
    resourceKey: "m6163636f756e742e72656e6577616c2e6966796f7575736563616e63656c636f6e74726163747368657265696e73746561646e6f776f7261667465727468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.ifyouwithdrawservicestopsthatdayandwerefundeve": {
    resourceKey: "m6163636f756e742e72656e6577616c2e6966796f7577697468647261777365727669636573746f707374686174646179616e647765726566756e64657665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.iherebygivenoticethatiwithdrawfrommycontractfo": {
    resourceKey: "m6163636f756e742e72656e6577616c2e69686572656279676976656e6f746963657468617469776974686472617766726f6d6d79636f6e7472616374666f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.itrenewsonitsownattheendofeachintervalservicer": {
    resourceKey: "m6163636f756e742e72656e6577616c2e697472656e6577736f6e6974736f776e6174746865656e646f6665616368696e74657276616c7365727669636572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.keyfacts": {
    resourceKey: "m6163636f756e742e72656e6577616c2e6b65796661637473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.monthlyifitrenewstheleastyoullpayisthatpricemo": {
    resourceKey: "m6163636f756e742e72656e6577616c2e6d6f6e74686c796966697472656e6577737468656c65617374796f756c6c70617969737468617470726963656d6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.name": {
    resourceKey: "m6163636f756e742e72656e6577616c2e6e616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.orderedonpurchasedate": {
    resourceKey: "m6163636f756e742e72656e6577616c2e6f7264657265646f6e707572636861736564617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.plusanysalestax": {
    resourceKey: "m6163636f756e742e72656e6577616c2e706c7573616e7973616c6573746178",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.privatenetwork": {
    resourceKey: "m6163636f756e742e72656e6577616c2e707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.questionssupportsolstoneapp": {
    resourceKey: "m6163636f756e742e72656e6577616c2e7175657374696f6e73737570706f7274736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.questionssupportsolstoneapp2": {
    resourceKey: "m6163636f756e742e72656e6577616c2e7175657374696f6e73737570706f7274736f6c73746f6e6561707032",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.sentsubmittedat": {
    resourceKey: "m6163636f756e742e72656e6577616c2e73656e747375626d69747465646174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.servicerenewsonrenewaldate": {
    resourceKey: "m6163636f756e742e72656e6577616c2e7365727669636572656e6577736f6e72656e6577616c64617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.signatureonlyifyousendthison": {
    resourceKey: "m6163636f756e742e72656e6577616c2e7369676e61747572656f6e6c796966796f7573656e64746869736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.solpbc": {
    resourceKey: "m6163636f756e742e72656e6577616c2e736f6c706263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.solpbc16095east109thplacecommerce": {
    resourceKey: "m6163636f756e742e72656e6577616c2e736f6c7062633136303935656173743130397468706c616365636f6d6d65726365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.solpbcrunsyourservicesubscriptionanditssettore": {
    resourceKey: "m6163636f756e742e72656e6577616c2e736f6c70626372756e73796f757273657276696365737562736372697074696f6e616e64697473736574746f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.taxincluded": {
    resourceKey: "m6163636f756e742e72656e6577616c2e746178696e636c75646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.theplanservicepriceeveryinterval": {
    resourceKey: "m6163636f756e742e72656e6577616c2e746865706c616e7365727669636570726963656576657279696e74657276616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.thesubscriptionservicepriceeveryintervalbought": {
    resourceKey: "m6163636f756e742e72656e6577616c2e746865737562736372697074696f6e7365727669636570726963656576657279696e74657276616c626f75676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.thisisareminderyourservicesubscriptionrenewson": {
    resourceKey: "m6163636f756e742e72656e6577616c2e7468697369736172656d696e646572796f757273657276696365737562736372697074696f6e72656e6577736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.thisisyourrighttowithdrawwhichcancelstherenewa": {
    resourceKey: "m6163636f756e742e72656e6577616c2e746869736973796f75727269676874746f7769746864726177776869636863616e63656c7374686572656e657761",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.tocancelbycancelbydatesigninatservicessolstone": {
    resourceKey: "m6163636f756e742e72656e6577616c2e746f63616e63656c627963616e63656c6279646174657369676e696e61747365727669636573736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.wereceivedyourwithdrawalkeepthisemail": {
    resourceKey: "m6163636f756e742e72656e6577616c2e77657265636569766564796f75727769746864726177616c6b65657074686973656d61696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.wererefundingeverythingyoupaidforitsrenewalonw": {
    resourceKey: "m6163636f756e742e72656e6577616c2e77657265726566756e64696e6765766572797468696e67796f7570616964666f7269747372656e6577616c6f6e77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.wererefundingeverythingyoupaidforthissubscript": {
    resourceKey: "m6163636f756e742e72656e6577616c2e77657265726566756e64696e6765766572797468696e67796f7570616964666f7274686973737562736372697074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.whathappensnowservicestopstodayandwontrenewand": {
    resourceKey: "m6163636f756e742e72656e6577616c2e7768617468617070656e736e6f777365727669636573746f7073746f646179616e64776f6e7472656e6577616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.whatyousentusawithdrawalfromyourservicesubscri": {
    resourceKey: "m6163636f756e742e72656e6577616c2e77686174796f7573656e747573617769746864726177616c66726f6d796f75727365727669636573756273637269",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.whoweare": {
    resourceKey: "m6163636f756e742e72656e6577616c2e77686f7765617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.whowearesolpbc16095east109thplacecommercecityc": {
    resourceKey: "m6163636f756e742e72656e6577616c2e77686f7765617265736f6c7062633136303935656173743130397468706c616365636f6d6d657263656369747963",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.withdrawalformfillthisinandsend": {
    resourceKey: "m6163636f756e742e72656e6577616c2e7769746864726177616c666f726d66696c6c74686973696e616e6473656e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.youcanalsowithdrawforafullrefunduntiltheendoft": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f7563616e616c736f7769746864726177666f726166756c6c726566756e64756e74696c746865656e646f6674",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.youcancancelthisrenewalforafullrefunduntilthee": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f7563616e63616e63656c7468697372656e6577616c666f726166756c6c726566756e64756e74696c74686565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.yougetthisoncecountedfromthispurchasearenewald": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f75676574746869736f6e6365636f756e74656466726f6d7468697370757263686173656172656e6577616c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.youjustsubscribedtoservicehereswhatthatmeansin": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f756a75737473756273637269626564746f73657276696365686572657377686174746861746d65616e73696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.youjustsubscribedtoservicehereswhatthatmeansin2": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f756a75737473756273637269626564746f73657276696365686572657377686174746861746d65616e73696e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.youresubscribedtoserviceandthisisthewrittencon": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f75726573756273637269626564746f73657276696365616e647468697369737468657772697474656e636f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.yourrightsifserviceisntasdescribedordoesntwork": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f757272696768747369667365727669636569736e7461736465736372696265646f72646f65736e74776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.yourservicesubscriptionhasrenewedandcontinuesf": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f757273657276696365737562736372697074696f6e68617372656e65776564616e64636f6e74696e75657366",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.yourservicesubscriptionkeepthisforyourrecords": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f757273657276696365737562736372697074696f6e6b65657074686973666f72796f75727265636f726473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.yourservicesubscriptionrenewedyoucancancelitfo": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f757273657276696365737562736372697074696f6e72656e65776564796f7563616e63616e63656c6974666f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.yourservicesubscriptionrenewsonrenewaldate": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f757273657276696365737562736372697074696f6e72656e6577736f6e72656e6577616c64617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.yourservicesubscriptionthewrittenconfirmationw": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f757273657276696365737562736372697074696f6e7468657772697474656e636f6e6669726d6174696f6e77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.renewal.youwithdrewfromyourservicesubscription": {
    resourceKey: "m6163636f756e742e72656e6577616c2e796f75776974686472657766726f6d796f757273657276696365737562736372697074696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.apply": {
    resourceKey: "m6163636f756e742e73636f75742e6170706c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.approved": {
    resourceKey: "m6163636f756e742e73636f75742e617070726f766564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.confidentialprocessing": {
    resourceKey: "m6163636f756e742e73636f75742e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.confidentialprocessingisavailabletoapprovedsco": {
    resourceKey: "m6163636f756e742e73636f75742e636f6e666964656e7469616c70726f63657373696e676973617661696c61626c65746f617070726f76656473636f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.free": {
    resourceKey: "m6163636f756e742e73636f75742e66726565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.keptfornothing": {
    resourceKey: "m6163636f756e742e73636f75742e6b657074666f726e6f7468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.nbspscoutaccessisapprovedforthissignin": {
    resourceKey: "m6163636f756e742e73636f75742e6e62737073636f75746163636573736973617070726f766564666f72746869737369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.nocontentisretainednohumanreviewsitnothingisus": {
    resourceKey: "m6163636f756e742e73636f75742e6e6f636f6e74656e74697372657461696e65646e6f68756d616e7265766965777369746e6f7468696e6769737573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.pending": {
    resourceKey: "m6163636f756e742e73636f75742e70656e64696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.pendingapplied": {
    resourceKey: "m6163636f756e742e73636f75742e70656e64696e676170706c696564",
    formatIntent: "text",
    arguments: [
      { name: "relativeTime", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.scout.scout": {
    resourceKey: "m6163636f756e742e73636f75742e73636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.services": {
    resourceKey: "m6163636f756e742e73636f75742e7365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.sharefeedback": {
    resourceKey: "m6163636f756e742e73636f75742e7368617265666565646261636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.sharefeedbackthroughsupportandfollowwhatschang": {
    resourceKey: "m6163636f756e742e73636f75742e7368617265666565646261636b7468726f756768737570706f7274616e64666f6c6c6f7777686174736368616e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.terms": {
    resourceKey: "m6163636f756e742e73636f75742e7465726d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.testerprogram": {
    resourceKey: "m6163636f756e742e73636f75742e74657374657270726f6772616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.yourjournaldoesthechecking": {
    resourceKey: "m6163636f756e742e73636f75742e796f75726a6f75726e616c646f6573746865636865636b696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.yourjournalmustverifytheservicebeforeanythingi": {
    resourceKey: "m6163636f756e742e73636f75742e796f75726a6f75726e616c6d757374766572696679746865736572766963656265666f7265616e797468696e6769",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.scout.yourservices": {
    resourceKey: "m6163636f756e742e73636f75742e796f75727365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.accesshasended": {
    resourceKey: "m6163636f756e742e73657276696365732e616363657373686173656e646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.allow": {
    resourceKey: "m6163636f756e742e73657276696365732e616c6c6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.anaddressforyourjournal": {
    resourceKey: "m6163636f756e742e73657276696365732e616e61646472657373666f72796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.anaddressforyourjournalsoan": {
    resourceKey: "m6163636f756e742e73657276696365732e616e61646472657373666f72796f75726a6f75726e616c736f616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.anaddressoninternetforyourjournal": {
    resourceKey: "m6163636f756e742e73657276696365732e616e616464726573736f6e696e7465726e6574666f72796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.anaddressoninternetforyourjournal2": {
    resourceKey: "m6163636f756e742e73657276696365732e616e616464726573736f6e696e7465726e6574666f72796f75726a6f75726e616c32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.anencryptedcopyonlyyoucanread": {
    resourceKey: "m6163636f756e742e73657276696365732e616e656e63727970746564636f70796f6e6c79796f7563616e72656164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.annualonlytaxincludedperjournalnot": {
    resourceKey: "m6163636f756e742e73657276696365732e616e6e75616c6f6e6c79746178696e636c756465647065726a6f75726e616c6e6f74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.asubscriptionisneeded": {
    resourceKey: "m6163636f756e742e73657276696365732e61737562736372697074696f6e69736e6565646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.available": {
    resourceKey: "m6163636f756e742e73657276696365732e617661696c61626c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.available2": {
    resourceKey: "m6163636f756e742e73657276696365732e617661696c61626c6532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.availableapprovedscoutsthinkoffyourdevice": {
    resourceKey: "m6163636f756e742e73657276696365732e617661696c61626c65617070726f76656473636f7574737468696e6b6f6666796f7572646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.availableenablefromyourjournal": {
    resourceKey: "m6163636f756e742e73657276696365732e617661696c61626c65656e61626c6566726f6d796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.availabletoapprovedscouts": {
    resourceKey: "m6163636f756e742e73657276696365732e617661696c61626c65746f617070726f76656473636f757473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.billedthroughstripe": {
    resourceKey: "m6163636f756e742e73657276696365732e62696c6c65647468726f756768737472697065",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.billedthroughstripeonyourownnetworksamewifiory": {
    resourceKey: "m6163636f756e742e73657276696365732e62696c6c65647468726f7567687374726970656f6e796f75726f776e6e6574776f726b73616d65776966696f7279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.billing": {
    resourceKey: "m6163636f756e742e73657276696365732e62696c6c696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.blindbyconstruction": {
    resourceKey: "m6163636f756e742e73657276696365732e626c696e646279636f6e737472756374696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.builtin": {
    resourceKey: "m6163636f756e742e73657276696365732e6275696c74696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.builtintosolstone": {
    resourceKey: "m6163636f756e742e73657276696365732e6275696c74696e746f736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.cancel": {
    resourceKey: "m6163636f756e742e73657276696365732e63616e63656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.cancelconfidentialprocessing": {
    resourceKey: "m6163636f756e742e73657276696365732e63616e63656c636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.cancelsolstoneme": {
    resourceKey: "m6163636f756e742e73657276696365732e63616e63656c736f6c73746f6e656d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.cannotseeyourtraffic": {
    resourceKey: "m6163636f756e742e73657276696365732e63616e6e6f74736565796f757274726166666963",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.check": {
    resourceKey: "m6163636f756e742e73657276696365732e636865636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.complimentaryforapprovedscoutsturniton": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6d706c696d656e74617279666f72617070726f76656473636f7574737475726e69746f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.complimentarywhileyoureanapprovedscout2": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6d706c696d656e746172797768696c65796f757265616e617070726f76656473636f757432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialgpusinmicrosoftazurethatsol": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c67707573696e6d6963726f736f6674617a75726574686174736f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessing": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessing2": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e6732",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessingisavailableapprovedscoutsena": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e676973617661696c61626c65617070726f76656473636f757473656e61",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessingisavailableapprovedscoutsena2": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e676973617661696c61626c65617070726f76656473636f757473656e6132",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessingisavailabletoapprovedsco": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e676973617661696c61626c65746f617070726f76656473636f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessingiscomplimentarywhileyoure": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e676973636f6d706c696d656e746172797768696c65796f757265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessingoffyourdeviceonconfidential": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e676f6666796f75726465766963656f6e636f6e666964656e7469616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessingsends": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e6773656e6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessingsends2": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e6773656e647332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confidentialprocessingsendsyourthinkingoffyour": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e666964656e7469616c70726f63657373696e6773656e6473796f75727468696e6b696e676f6666796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.confirmscoutcovenant": {
    resourceKey: "m6163636f756e742e73657276696365732e636f6e6669726d73636f7574636f76656e616e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.covenants": {
    resourceKey: "m6163636f756e742e73657276696365732e636f76656e616e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.covered": {
    resourceKey: "m6163636f756e742e73657276696365732e636f7665726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.covered2": {
    resourceKey: "m6163636f756e742e73657276696365732e636f766572656432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.coveredsince2": {
    resourceKey: "m6163636f756e742e73657276696365732e636f766572656473696e636532",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.services.datatransparency": {
    resourceKey: "m6163636f756e742e73657276696365732e646174617472616e73706172656e6379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.enabled2": {
    resourceKey: "m6163636f756e742e73657276696365732e656e61626c656432",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.services.encryptedbackup": {
    resourceKey: "m6163636f756e742e73657276696365732e656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.encryptedbackup2": {
    resourceKey: "m6163636f756e742e73657276696365732e656e637279707465646261636b757032",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.encryptedbackup3": {
    resourceKey: "m6163636f756e742e73657276696365732e656e637279707465646261636b757033",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.encryptedbeforeitleaves": {
    resourceKey: "m6163636f756e742e73657276696365732e656e637279707465646265666f726569746c6561766573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.firstturnedon": {
    resourceKey: "m6163636f756e742e73657276696365732e66697273747475726e65646f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.freefromusyourjournalwalksyou": {
    resourceKey: "m6163636f756e742e73657276696365732e6672656566726f6d7573796f75726a6f75726e616c77616c6b73796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.freewhileyoureanapprovedscout2": {
    resourceKey: "m6163636f756e742e73657276696365732e667265657768696c65796f757265616e617070726f76656473636f757432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.freewhileyoureanapprovedscoutonyourownnetworks": {
    resourceKey: "m6163636f756e742e73657276696365732e667265657768696c65796f757265616e617070726f76656473636f75746f6e796f75726f776e6e6574776f726b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.hardware": {
    resourceKey: "m6163636f756e742e73657276696365732e6861726477617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.helpshapesolstone": {
    resourceKey: "m6163636f756e742e73657276696365732e68656c707368617065736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.howitworks": {
    resourceKey: "m6163636f756e742e73657276696365732e686f776974776f726b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.ifyourerestoringajournalreturntoitandstartther": {
    resourceKey: "m6163636f756e742e73657276696365732e6966796f757265726573746f72696e67616a6f75726e616c72657475726e746f6974616e64737461727474686572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.ifyourjournalcantverifyservice": {
    resourceKey: "m6163636f756e742e73657276696365732e6966796f75726a6f75726e616c63616e7476657269667973657276696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.ifyouturnencryptedbackupoffsolpbckeepsyourencr": {
    resourceKey: "m6163636f756e742e73657276696365732e6966796f757475726e656e637279707465646261636b75706f6666736f6c7062636b65657073796f7572656e6372",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.iunderstand": {
    resourceKey: "m6163636f756e742e73657276696365732e69756e6465727374616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.keepanencryptedcopyyourjournalsomewhere": {
    resourceKey: "m6163636f756e742e73657276696365732e6b656570616e656e63727970746564636f7079796f75726a6f75726e616c736f6d657768657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.keepanencryptedcopyyourjournalsomewhere2": {
    resourceKey: "m6163636f756e742e73657276696365732e6b656570616e656e63727970746564636f7079796f75726a6f75726e616c736f6d65776865726532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.keptfornothing": {
    resourceKey: "m6163636f756e742e73657276696365732e6b657074666f726e6f7468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.keptfornothing2": {
    resourceKey: "m6163636f756e742e73657276696365732e6b657074666f726e6f7468696e6732",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.leaveyourdevicewhentheaudioswitchisonitsdefaul": {
    resourceKey: "m6163636f756e742e73657276696365732e6c65617665796f75726465766963657768656e746865617564696f73776974636869736f6e69747364656661756c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.managebillingtokeepit": {
    resourceKey: "m6163636f756e742e73657276696365732e6d616e61676562696c6c696e67746f6b6565706974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.managebillingtokeepiton": {
    resourceKey: "m6163636f756e742e73657276696365732e6d616e61676562696c6c696e67746f6b65657069746f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.modelissameeitherwayparakeettdt": {
    resourceKey: "m6163636f756e742e73657276696365732e6d6f64656c697373616d65656974686572776179706172616b656574746474",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.modelsolpbcrunsitselfnothird": {
    resourceKey: "m6163636f756e742e73657276696365732e6d6f64656c736f6c70626372756e73697473656c666e6f7468697264",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.modelsolpbcrunsitselfwithno": {
    resourceKey: "m6163636f756e742e73657276696365732e6d6f64656c736f6c70626372756e73697473656c66776974686e6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.nbspconfidentialprocessingisavailabletothissig": {
    resourceKey: "m6163636f756e742e73657276696365732e6e627370636f6e666964656e7469616c70726f63657373696e676973617661696c61626c65746f74686973736967",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.nbspconfidentialprocessingisnotavailabletothis": {
    resourceKey: "m6163636f756e742e73657276696365732e6e627370636f6e666964656e7469616c70726f63657373696e6769736e6f74617661696c61626c65746f74686973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.nbspyourencryptedbackupison": {
    resourceKey: "m6163636f756e742e73657276696365732e6e627370796f7572656e637279707465646261636b757069736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.nbspyourpaymentisuptodate": {
    resourceKey: "m6163636f756e742e73657276696365732e6e627370796f75727061796d656e7469737570746f64617465",
    formatIntent: "text",
    arguments: [
      { name: "coveredPill", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.services.nbspyourprivatenetworkison": {
    resourceKey: "m6163636f756e742e73657276696365732e6e627370796f7572707269766174656e6574776f726b69736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.neveryourjournalwhichstaysonthedeviceitrunsoni": {
    resourceKey: "m6163636f756e742e73657276696365732e6e65766572796f75726a6f75726e616c776869636873746179736f6e746865646576696365697472756e736f6e69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.neveryourjournalwhichstaysonthedeviceitrunsoni2": {
    resourceKey: "m6163636f756e742e73657276696365732e6e65766572796f75726a6f75726e616c776869636873746179736f6e746865646576696365697472756e736f6e6932",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.noanalyticsandnotrackingsignin": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f616e616c7974696373616e646e6f747261636b696e677369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.noanalyticsnobehavioralprofilingandno": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f616e616c79746963736e6f6265686176696f72616c70726f66696c696e67616e646e6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.nocontentisretainednohumanreviews": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f636f6e74656e74697372657461696e65646e6f68756d616e72657669657773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.nocontentisretainednohumanreviews2": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f636f6e74656e74697372657461696e65646e6f68756d616e7265766965777332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notapproved": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74617070726f766564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notavailable": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74617661696c61626c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notavailable2": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74617661696c61626c6532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notcovered": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74636f7665726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notcovered2": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74636f766572656432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notifications": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74696669636174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notificationsarebuiltintoappturnthem": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74696669636174696f6e736172656275696c74696e746f6170707475726e7468656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notificationscomewithsolstonefreewithno": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74696669636174696f6e73636f6d6577697468736f6c73746f6e6566726565776974686e6f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notificationsreachyouonyourdeviceswhen": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74696669636174696f6e737265616368796f756f6e796f7572646576696365737768656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notificationsreachyouwhentheressomething": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74696669636174696f6e737265616368796f757768656e746865726573736f6d657468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.notnow": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f746e6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.nottrackingsurface": {
    resourceKey: "m6163636f756e742e73657276696365732e6e6f74747261636b696e6773757266616365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.off": {
    resourceKey: "m6163636f756e742e73657276696365732e6f6666",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.offuntilyouturnitonturn": {
    resourceKey: "m6163636f756e742e73657276696365732e6f6666756e74696c796f757475726e69746f6e7475726e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.on": {
    resourceKey: "m6163636f756e742e73657276696365732e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.on2": {
    resourceKey: "m6163636f756e742e73657276696365732e6f6e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.onhardwaresolpbcruns": {
    resourceKey: "m6163636f756e742e73657276696365732e6f6e6861726477617265736f6c70626372756e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.onsamewifioroveryourown": {
    resourceKey: "m6163636f756e742e73657276696365732e6f6e73616d65776966696f726f766572796f75726f776e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.onyourdevices": {
    resourceKey: "m6163636f756e742e73657276696365732e6f6e796f757264657669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.opensource": {
    resourceKey: "m6163636f756e742e73657276696365732e6f70656e736f75726365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.opensourceselfhostable": {
    resourceKey: "m6163636f756e742e73657276696365732e6f70656e736f7572636573656c66686f737461626c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.operatedbysolpbc": {
    resourceKey: "m6163636f756e742e73657276696365732e6f706572617465646279736f6c706263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.operatedbysolpbc48year": {
    resourceKey: "m6163636f756e742e73657276696365732e6f706572617465646279736f6c706263343879656172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.or249monthtaxincludedper": {
    resourceKey: "m6163636f756e742e73657276696365732e6f723234396d6f6e7468746178696e636c75646564706572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.or499monthtaxincludedoperated": {
    resourceKey: "m6163636f756e742e73657276696365732e6f723439396d6f6e7468746178696e636c756465646f70657261746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.or999monthtaxincludedper": {
    resourceKey: "m6163636f756e742e73657276696365732e6f723939396d6f6e7468746178696e636c75646564706572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.oruseyourowndomain": {
    resourceKey: "m6163636f756e742e73657276696365732e6f72757365796f75726f776e646f6d61696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.paymonthly": {
    resourceKey: "m6163636f756e742e73657276696365732e7061796d6f6e74686c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.payyearly": {
    resourceKey: "m6163636f756e742e73657276696365732e706179796561726c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.pointsolstoneatyourownstoragebackblaze": {
    resourceKey: "m6163636f756e742e73657276696365732e706f696e74736f6c73746f6e656174796f75726f776e73746f726167656261636b626c617a65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.privacypolicy": {
    resourceKey: "m6163636f756e742e73657276696365732e70726976616379706f6c696379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.privatenetwork": {
    resourceKey: "m6163636f756e742e73657276696365732e707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.privatenetwork2": {
    resourceKey: "m6163636f756e742e73657276696365732e707269766174656e6574776f726b32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.program": {
    resourceKey: "m6163636f756e742e73657276696365732e70726f6772616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.rathernotrunbucketletsolpbc": {
    resourceKey: "m6163636f756e742e73657276696365732e7261746865726e6f7472756e6275636b65746c6574736f6c706263",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.reachyourjournalfromyourphonefrom": {
    resourceKey: "m6163636f756e742e73657276696365732e7265616368796f75726a6f75726e616c66726f6d796f757270686f6e6566726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.reachyourjournalfromyourphoneyour": {
    resourceKey: "m6163636f756e742e73657276696365732e7265616368796f75726a6f75726e616c66726f6d796f757270686f6e65796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.release": {
    resourceKey: "m6163636f756e742e73657276696365732e72656c65617365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.releasenoteswhatsshippedandwhat": {
    resourceKey: "m6163636f756e742e73657276696365732e72656c656173656e6f746573776861747373686970706564616e6477686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.requestaccess": {
    resourceKey: "m6163636f756e742e73657276696365732e72657175657374616363657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.requestscout": {
    resourceKey: "m6163636f756e742e73657276696365732e7265717565737473636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.requestscoutaccess": {
    resourceKey: "m6163636f756e742e73657276696365732e7265717565737473636f7574616363657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.requestscoutaccessforthissignin": {
    resourceKey: "m6163636f756e742e73657276696365732e7265717565737473636f7574616363657373666f72746869737369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.requestscoutaccessforthissignin2": {
    resourceKey: "m6163636f756e742e73657276696365732e7265717565737473636f7574616363657373666f72746869737369676e696e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.restore": {
    resourceKey: "m6163636f756e742e73657276696365732e726573746f7265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.restorefromencryptedbackup": {
    resourceKey: "m6163636f756e742e73657276696365732e726573746f726566726f6d656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.scheduledtoturnoffon": {
    resourceKey: "m6163636f756e742e73657276696365732e7363686564756c6564746f7475726e6f66666f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.scout": {
    resourceKey: "m6163636f756e742e73657276696365732e73636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.scout2": {
    resourceKey: "m6163636f756e742e73657276696365732e73636f757432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.scoutaccessforthissigninhas": {
    resourceKey: "m6163636f756e742e73657276696365732e73636f7574616363657373666f72746869737369676e696e686173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.scoutistesterprogramapprovedscoutscan": {
    resourceKey: "m6163636f756e742e73657276696365732e73636f7574697374657374657270726f6772616d617070726f76656473636f75747363616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.scoutistesterprogramapprovedscoutsget": {
    resourceKey: "m6163636f756e742e73657276696365732e73636f7574697374657374657270726f6772616d617070726f76656473636f757473676574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.scouts": {
    resourceKey: "m6163636f756e742e73657276696365732e73636f757473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.services": {
    resourceKey: "m6163636f756e742e73657276696365732e7365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.serviceturnsspeechtextinmemoryon": {
    resourceKey: "m6163636f756e742e73657276696365732e736572766963657475726e7373706565636874657874696e6d656d6f72796f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.sessionspasskeysandemailaddresses": {
    resourceKey: "m6163636f756e742e73657276696365732e73657373696f6e73706173736b657973616e64656d61696c616464726573736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.setuppasskeyfornexttime": {
    resourceKey: "m6163636f756e742e73657276696365732e7365747570706173736b6579666f726e65787474696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.signinenable": {
    resourceKey: "m6163636f756e742e73657276696365732e7369676e696e656e61626c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.solpbcdeletedthatcopy": {
    resourceKey: "m6163636f756e742e73657276696365732e736f6c70626364656c6574656474686174636f7079",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.solpbckeepsanencryptedcopyyour": {
    resourceKey: "m6163636f756e742e73657276696365732e736f6c7062636b65657073616e656e63727970746564636f7079796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.solpbcrunsblindrelaysoyour": {
    resourceKey: "m6163636f756e742e73657276696365732e736f6c70626372756e73626c696e6472656c6179736f796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.solpbcrunsblindrelaysoyour2": {
    resourceKey: "m6163636f756e742e73657276696365732e736f6c70626372756e73626c696e6472656c6179736f796f757232",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.solpbcrunssolstonemerelayin": {
    resourceKey: "m6163636f756e742e73657276696365732e736f6c70626372756e73736f6c73746f6e656d6572656c6179696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.solpbcsownmodel": {
    resourceKey: "m6163636f756e742e73657276696365732e736f6c706263736f776e6d6f64656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.solstoneservices": {
    resourceKey: "m6163636f756e742e73657276696365732e736f6c73746f6e657365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.solstoneservices2": {
    resourceKey: "m6163636f756e742e73657276696365732e736f6c73746f6e65736572766963657332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.subscribe": {
    resourceKey: "m6163636f756e742e73657276696365732e737562736372696265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.taxincludedbilledsecurelythroughstripe": {
    resourceKey: "m6163636f756e742e73657276696365732e746178696e636c7564656462696c6c65647365637572656c797468726f756768737472697065",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.taxincludedbilledsecurelythroughstripebypaying": {
    resourceKey: "m6163636f756e742e73657276696365732e746178696e636c7564656462696c6c65647365637572656c797468726f7567687374726970656279706179696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.taxincludedbilledsecurelythroughstripecomplime": {
    resourceKey: "m6163636f756e742e73657276696365732e746178696e636c7564656462696c6c65647365637572656c797468726f756768737472697065636f6d706c696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.telluswhatyoureseeingor": {
    resourceKey: "m6163636f756e742e73657276696365732e74656c6c757377686174796f757265736565696e676f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.terms2": {
    resourceKey: "m6163636f756e742e73657276696365732e7465726d7332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.terms3": {
    resourceKey: "m6163636f756e742e73657276696365732e7465726d7333",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.testerprogramapprovedscoutscanenableconfidential": {
    resourceKey: "m6163636f756e742e73657276696365732e74657374657270726f6772616d617070726f76656473636f75747363616e656e61626c65636f6e666964656e7469616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.testerprogramconfidentialprocessingiscomplimentary": {
    resourceKey: "m6163636f756e742e73657276696365732e74657374657270726f6772616d636f6e666964656e7469616c70726f63657373696e676973636f6d706c696d656e74617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.textandimagesthatgomodelfor": {
    resourceKey: "m6163636f756e742e73657276696365732e74657874616e64696d6167657374686174676f6d6f64656c666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.thepublicrecordispermanent": {
    resourceKey: "m6163636f756e742e73657276696365732e7468657075626c69637265636f726469737065726d616e656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.thepublicrecordispermanent2": {
    resourceKey: "m6163636f756e742e73657276696365732e7468657075626c69637265636f726469737065726d616e656e7432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.therelaypassesalongencryptedbytesitcantreadsol": {
    resourceKey: "m6163636f756e742e73657276696365732e74686572656c6179706173736573616c6f6e67656e637279707465646279746573697463616e7472656164736f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.theresnokeytorevealbydesignnotbypromise": {
    resourceKey: "m6163636f756e742e73657276696365732e7468657265736e6f6b6579746f72657665616c627964657369676e6e6f74627970726f6d697365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.thesearetheoptionalpartssolpbcrunsforyouturnon": {
    resourceKey: "m6163636f756e742e73657276696365732e74686573656172657468656f7074696f6e616c7061727473736f6c70626372756e73666f72796f757475726e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.theseservicesareoptionalturnthemonwhentheyhelp": {
    resourceKey: "m6163636f756e742e73657276696365732e746865736573657276696365736172656f7074696f6e616c7475726e7468656d6f6e7768656e7468657968656c70",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.thesolstoneapprunsonyourdevicesandyourjournall": {
    resourceKey: "m6163636f756e742e73657276696365732e746865736f6c73746f6e6561707072756e736f6e796f757264657669636573616e64796f75726a6f75726e616c6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.thetextandimagesthatgotoamodelforprocessing": {
    resourceKey: "m6163636f756e742e73657276696365732e74686574657874616e64696d6167657374686174676f746f616d6f64656c666f7270726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.thinkingleaves": {
    resourceKey: "m6163636f756e742e73657276696365732e7468696e6b696e676c6561766573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.thinkoffyourdeviceonconfidentialhardware": {
    resourceKey: "m6163636f756e742e73657276696365732e7468696e6b6f6666796f75726465766963656f6e636f6e666964656e7469616c6861726477617265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.torequestaccess": {
    resourceKey: "m6163636f756e742e73657276696365732e746f72657175657374616363657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.transcribeaudioonserviceswitchlivesin": {
    resourceKey: "m6163636f756e742e73657276696365732e7472616e736372696265617564696f6f6e736572766963657377697463686c69766573696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.transcribeaudioonserviceswitchlivesin2": {
    resourceKey: "m6163636f756e742e73657276696365732e7472616e736372696265617564696f6f6e736572766963657377697463686c69766573696e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.turnitonfromyourjournal": {
    resourceKey: "m6163636f756e742e73657276696365732e7475726e69746f6e66726f6d796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.turnoff": {
    resourceKey: "m6163636f756e742e73657276696365732e7475726e6f6666",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.turnonconfidentialprocessing": {
    resourceKey: "m6163636f756e742e73657276696365732e7475726e6f6e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.turnonconfidentialprocessing2": {
    resourceKey: "m6163636f756e742e73657276696365732e7475726e6f6e636f6e666964656e7469616c70726f63657373696e6732",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.turnonencryptedbackup": {
    resourceKey: "m6163636f756e742e73657276696365732e7475726e6f6e656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.turnonencryptedbackup2": {
    resourceKey: "m6163636f756e742e73657276696365732e7475726e6f6e656e637279707465646261636b757032",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.turnonnotificationsoneachdeviceyouwanttohearfr": {
    resourceKey: "m6163636f756e742e73657276696365732e7475726e6f6e6e6f74696669636174696f6e736f6e65616368646576696365796f7577616e74746f686561726672",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.turnonprivatenetwork": {
    resourceKey: "m6163636f756e742e73657276696365732e7475726e6f6e707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.turnonsolstoneme": {
    resourceKey: "m6163636f756e742e73657276696365732e7475726e6f6e736f6c73746f6e656d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.useyourdevicesigninwithouttyping": {
    resourceKey: "m6163636f756e742e73657276696365732e757365796f75726465766963657369676e696e776974686f7574747970696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.wecouldntdecryptyouremailaddress": {
    resourceKey: "m6163636f756e742e73657276696365732e7765636f756c646e7464656372797074796f7572656d61696c61646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whatanagentgets": {
    resourceKey: "m6163636f756e742e73657276696365732e77686174616e6167656e7467657473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whatdoesnt": {
    resourceKey: "m6163636f756e742e73657276696365732e77686174646f65736e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whatleavesyourdevice": {
    resourceKey: "m6163636f756e742e73657276696365732e776861746c6561766573796f7572646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whatskept": {
    resourceKey: "m6163636f756e742e73657276696365732e77686174736b657074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whatsnewinsolstone": {
    resourceKey: "m6163636f756e742e73657276696365732e77686174736e6577696e736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whatsolpbcholdsforyoursign": {
    resourceKey: "m6163636f756e742e73657276696365732e77686174736f6c706263686f6c6473666f72796f75727369676e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whatsolpbcholdsforyoursign2": {
    resourceKey: "m6163636f756e742e73657276696365732e77686174736f6c706263686f6c6473666f72796f75727369676e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whatyoupayforandwhenit": {
    resourceKey: "m6163636f756e742e73657276696365732e77686174796f75706179666f72616e647768656e6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whenconfidentialprocessingison": {
    resourceKey: "m6163636f756e742e73657276696365732e7768656e636f6e666964656e7469616c70726f63657373696e6769736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whenconfidentialprocessingisonandaudio": {
    resourceKey: "m6163636f756e742e73657276696365732e7768656e636f6e666964656e7469616c70726f63657373696e6769736f6e616e64617564696f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.whereyoumanageit": {
    resourceKey: "m6163636f756e742e73657276696365732e7768657265796f756d616e6167656974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.year": {
    resourceKey: "m6163636f756e742e73657276696365732e79656172",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.youchoosewhatitmayseeyourwholejournaloronlythe": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7563686f6f73657768617469746d6179736565796f757277686f6c656a6f75726e616c6f726f6e6c79746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yougetshortheadsuponyour": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7567657473686f7274686561647375706f6e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.youneverhavepayusbringyour": {
    resourceKey: "m6163636f756e742e73657276696365732e796f756e657665726861766570617975736272696e67796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.youneverhavepayusonyour": {
    resourceKey: "m6163636f756e742e73657276696365732e796f756e657665726861766570617975736f6e796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.youneverhavepayusyourjournal": {
    resourceKey: "m6163636f756e742e73657276696365732e796f756e65766572686176657061797573796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.youneverhavetopayus": {
    resourceKey: "m6163636f756e742e73657276696365732e796f756e6576657268617665746f7061797573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.youneverhavetopayusonyourownnetworksamewifiory": {
    resourceKey: "m6163636f756e742e73657276696365732e796f756e6576657268617665746f70617975736f6e796f75726f776e6e6574776f726b73616d65776966696f7279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourchoice": {
    resourceKey: "m6163636f756e742e73657276696365732e796f757263686f696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourconfidentialprocessingisscheduledtoendon": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7572636f6e666964656e7469616c70726f63657373696e6769737363686564756c6564746f656e646f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourjournaldoeschecking": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726a6f75726e616c646f6573636865636b696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourjournaldoesntneedsolpbctobereachableatunne": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726a6f75726e616c646f65736e746e656564736f6c706263746f6265726561636861626c656174756e6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourjournalgetsanaddressontheinternetanagentsr": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726a6f75726e616c67657473616e616464726573736f6e746865696e7465726e6574616e6167656e747372",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourjournalisencryptedonyourdevice": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726a6f75726e616c6973656e637279707465646f6e796f7572646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourjournalmustverifyservicebeforeanything": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726a6f75726e616c6d757374766572696679736572766963656265666f7265616e797468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourjournalmustverifyservicebeforeanything3": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726a6f75726e616c6d757374766572696679736572766963656265666f7265616e797468696e6733",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourjournalmustverifytheservicebeforeanythingi": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726a6f75726e616c6d757374766572696679746865736572766963656265666f7265616e797468696e6769",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourjournalsagentsappworkswith": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726a6f75726e616c736167656e7473617070776f726b7377697468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourjournalstaysondeviceitruns": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726a6f75726e616c73746179736f6e646576696365697472756e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourlastpaymentdidntgothrough": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726c6173747061796d656e746469646e74676f7468726f756768",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourlastpaymentdidntgothrough2": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726c6173747061796d656e746469646e74676f7468726f75676832",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourlastpaymentdidntgothrough3": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726c6173747061796d656e746469646e74676f7468726f75676833",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourlastpaymentdidntgothrough4": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726c6173747061796d656e746469646e74676f7468726f75676834",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourlastpaymentneedsattention": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726c6173747061796d656e746e65656473617474656e74696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourownbucketalwaysfree": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726f776e6275636b6574616c7761797366726565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourownmachineholdsprivatekeyand": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726f776e6d616368696e65686f6c6473707269766174656b6579616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourownnetworkalwaysfree": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75726f776e6e6574776f726b616c7761797366726565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourprivatenetwork": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7572707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourprivatenetworkfromanywhere": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7572707269766174656e6574776f726b66726f6d616e797768657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourprivatenetworkreachyourjournalfrom": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7572707269766174656e6574776f726b7265616368796f75726a6f75726e616c66726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourscoutrequestisunderreview": {
    resourceKey: "m6163636f756e742e73657276696365732e796f757273636f7574726571756573746973756e646572726576696577",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourservices": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75727365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourservices2": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7572736572766963657332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yoursolstonemecoverageisscheduledtoendon": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7572736f6c73746f6e656d65636f76657261676569737363686564756c6564746f656e646f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yoursubscriptioncoversjournalsturnedonwhileyou": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7572737562736372697074696f6e636f766572736a6f75726e616c737475726e65646f6e7768696c65796f75",
    formatIntent: "text",
    arguments: [
      { name: "count", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.services.yoursubscriptioncoversonejournaluseit": {
    resourceKey: "m6163636f756e742e73657276696365732e796f7572737562736372697074696f6e636f766572736f6e656a6f75726e616c7573656974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourthinkingoffyourdevice": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75727468696e6b696e676f6666796f7572646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yourthinkingoffyourdevice2": {
    resourceKey: "m6163636f756e742e73657276696365732e796f75727468696e6b696e676f6666796f757264657669636532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.services.yr": {
    resourceKey: "m6163636f756e742e73657276696365732e7972",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.settings.added": {
    resourceKey: "m6163636f756e742e73657474696e67732e6164646564",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.settings.device": {
    resourceKey: "m6163636f756e742e73657474696e67732e646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.settings.lastused": {
    resourceKey: "m6163636f756e742e73657474696e67732e6c61737475736564",
    formatIntent: "text",
    arguments: [
      { name: "relativeTime", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.settings.neverused": {
    resourceKey: "m6163636f756e742e73657474696e67732e6e6576657275736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.settings.on2": {
    resourceKey: "m6163636f756e742e73657474696e67732e6f6e32",
    formatIntent: "text",
    arguments: [
      { name: "browser", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "operatingSystem", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.settings.passkey": {
    resourceKey: "m6163636f756e742e73657474696e67732e706173736b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.settings.unknowndevice": {
    resourceKey: "m6163636f756e742e73657474696e67732e756e6b6e6f776e646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.addanemail": {
    resourceKey: "m6163636f756e742e7369676e696e2e616464616e656d61696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.backhome": {
    resourceKey: "m6163636f756e742e7369676e696e2e6261636b686f6d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.bysigninginyouagreetothe": {
    resourceKey: "m6163636f756e742e7369676e696e2e62797369676e696e67696e796f756167726565746f746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.codesentto": {
    resourceKey: "m6163636f756e742e7369676e696e2e636f646573656e74746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.currentdevice": {
    resourceKey: "m6163636f756e742e7369676e696e2e63757272656e74646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.devicesandphonescurrentlysignedinmanage": {
    resourceKey: "m6163636f756e742e7369676e696e2e64657669636573616e6470686f6e657363757272656e746c797369676e6564696e6d616e616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.devicesandphonessignedinrightnow": {
    resourceKey: "m6163636f756e742e7369676e696e2e64657669636573616e6470686f6e65737369676e6564696e72696768746e6f77",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.didntgetit": {
    resourceKey: "m6163636f756e742e7369676e696e2e6469646e746765746974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.emailaddresses": {
    resourceKey: "m6163636f756e742e7369676e696e2e656d61696c616464726573736573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.enteryouremailand6digitcode": {
    resourceKey: "m6163636f756e742e7369676e696e2e656e746572796f7572656d61696c616e64366469676974636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.foronetimecodewhenyoudon": {
    resourceKey: "m6163636f756e742e7369676e696e2e666f726f6e6574696d65636f64657768656e796f75646f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.howyougetintothispagemanage": {
    resourceKey: "m6163636f756e742e7369676e696e2e686f77796f75676574696e746f74686973706167656d616e616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.howyousigninaddmorethan": {
    resourceKey: "m6163636f756e742e7369676e696e2e686f77796f757369676e696e6164646d6f72657468616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.itexpires10minutesafterwesentit": {
    resourceKey: "m6163636f756e742e7369676e696e2e69746578706972657331306d696e757465736166746572776573656e746974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.makeprimary": {
    resourceKey: "m6163636f756e742e7369676e696e2e6d616b657072696d617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.noanalyticsandnotrackingthisis": {
    resourceKey: "m6163636f756e742e7369676e696e2e6e6f616e616c7974696373616e646e6f747261636b696e67746869736973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.noemailaddressesforyoursignin": {
    resourceKey: "m6163636f756e742e7369676e696e2e6e6f656d61696c616464726573736573666f72796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.notfound": {
    resourceKey: "m6163636f756e742e7369676e696e2e6e6f74666f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.nothingatthisaddress": {
    resourceKey: "m6163636f756e742e7369676e696e2e6e6f7468696e6761747468697361646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.openservicessolstoneapp": {
    resourceKey: "m6163636f756e742e7369676e696e2e6f70656e7365727669636573736f6c73746f6e65617070",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.requestanewcode": {
    resourceKey: "m6163636f756e742e7369676e696e2e72657175657374616e6577636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.seeyounexttime": {
    resourceKey: "m6163636f756e742e7369676e696e2e736565796f756e65787474696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.signedinas": {
    resourceKey: "m6163636f756e742e7369676e696e2e7369676e6564696e6173",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.signedout": {
    resourceKey: "m6163636f756e742e7369676e696e2e7369676e65646f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.signedout2": {
    resourceKey: "m6163636f756e742e7369676e696e2e7369676e65646f757432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.signinmanageoptionalservicesyouve": {
    resourceKey: "m6163636f756e742e7369676e696e2e7369676e696e6d616e6167656f7074696f6e616c7365727669636573796f757665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.signout": {
    resourceKey: "m6163636f756e742e7369676e696e2e7369676e6f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.signouteveryotherdevice": {
    resourceKey: "m6163636f756e742e7369676e696e2e7369676e6f757465766572796f74686572646576696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.startover": {
    resourceKey: "m6163636f756e742e7369676e696e2e73746172746f766572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.terms": {
    resourceKey: "m6163636f756e742e7369676e696e2e7465726d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.verify": {
    resourceKey: "m6163636f756e742e7369676e696e2e766572696679",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.verifyyourcode": {
    resourceKey: "m6163636f756e742e7369676e696e2e766572696679796f7572636f6465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.wecouldntverifythissignin": {
    resourceKey: "m6163636f756e742e7369676e696e2e7765636f756c646e74766572696679746869737369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.signin.youremailsecuritymayhavemodifiedlink": {
    resourceKey: "m6163636f756e742e7369676e696e2e796f7572656d61696c73656375726974796d6179686176656d6f6469666965646c696e6b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.activerequests": {
    resourceKey: "m6163636f756e742e737570706f72742e6163746976657265717565737473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.addreplyorattachscreenshotorlog": {
    resourceKey: "m6163636f756e742e737570706f72742e6164647265706c796f7261747461636873637265656e73686f746f726c6f67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.attachmentremovedaftertriage2": {
    resourceKey: "m6163636f756e742e737570706f72742e6174746163686d656e7472656d6f766564616674657274726961676532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.attachments": {
    resourceKey: "m6163636f756e742e737570706f72742e6174746163686d656e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.attachmentsneedanothertry": {
    resourceKey: "m6163636f756e742e737570706f72742e6174746163686d656e74736e656564616e6f74686572747279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.backyoursupport": {
    resourceKey: "m6163636f756e742e737570706f72742e6261636b796f7572737570706f7274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.checkagain": {
    resourceKey: "m6163636f756e742e737570706f72742e636865636b616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.closeandremovedetails": {
    resourceKey: "m6163636f756e742e737570706f72742e636c6f7365616e6472656d6f766564657461696c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.closed2": {
    resourceKey: "m6163636f756e742e737570706f72742e636c6f73656432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.closedrequest": {
    resourceKey: "m6163636f756e742e737570706f72742e636c6f73656472657175657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.closedrequests": {
    resourceKey: "m6163636f756e742e737570706f72742e636c6f7365647265717565737473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.confirmremovalbeforecontinuing": {
    resourceKey: "m6163636f756e742e737570706f72742e636f6e6669726d72656d6f76616c6265666f7265636f6e74696e75696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.created2": {
    resourceKey: "m6163636f756e742e737570706f72742e6372656174656432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.details": {
    resourceKey: "m6163636f756e742e737570706f72742e64657461696c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.detailsarescheduledtoberemovedon": {
    resourceKey: "m6163636f756e742e737570706f72742e64657461696c736172657363686564756c6564746f626572656d6f7665646f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.detailsremovedprotectyourprivacy": {
    resourceKey: "m6163636f756e742e737570706f72742e64657461696c7372656d6f76656470726f74656374796f757270726976616379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.detailsremovedtoprotectyourprivacy": {
    resourceKey: "m6163636f756e742e737570706f72742e64657461696c7372656d6f766564746f70726f74656374796f757270726976616379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.fileswerenotconfirmedreselectsamefiles": {
    resourceKey: "m6163636f756e742e737570706f72742e66696c6573776572656e6f74636f6e6669726d6564726573656c65637473616d6566696c6573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.gotitthisisrequest": {
    resourceKey: "m6163636f756e742e737570706f72742e676f74697474686973697372657175657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.ifaserviceisntworkingthe": {
    resourceKey: "m6163636f756e742e737570706f72742e6966617365727669636569736e74776f726b696e67746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.inprogress": {
    resourceKey: "m6163636f756e742e737570706f72742e696e70726f6772657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.istillneedhelp": {
    resourceKey: "m6163636f756e742e737570706f72742e697374696c6c6e65656468656c70",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.iunderstandthatsupportservicepermanentlyremoves": {
    resourceKey: "m6163636f756e742e737570706f72742e69756e6465727374616e6474686174737570706f7274736572766963657065726d616e656e746c7972656d6f766573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.messages": {
    resourceKey: "m6163636f756e742e737570706f72742e6d65737361676573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.noattachments": {
    resourceKey: "m6163636f756e742e737570706f72742e6e6f6174746163686d656e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.noclosedrequests": {
    resourceKey: "m6163636f756e742e737570706f72742e6e6f636c6f7365647265717565737473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.nomessages": {
    resourceKey: "m6163636f756e742e737570706f72742e6e6f6d65737361676573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.noopenrequestsneedhelpopenone": {
    resourceKey: "m6163636f756e742e737570706f72742e6e6f6f70656e72657175657374736e65656468656c706f70656e6f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.olderclosedrequests": {
    resourceKey: "m6163636f756e742e737570706f72742e6f6c646572636c6f7365647265717565737473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.open": {
    resourceKey: "m6163636f756e742e737570706f72742e6f70656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.openrequest": {
    resourceKey: "m6163636f756e742e737570706f72742e6f70656e72657175657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.optionalopenaboutchoosecopyandpaste": {
    resourceKey: "m6163636f756e742e737570706f72742e6f7074696f6e616c6f70656e61626f757463686f6f7365636f7079616e647061737465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.optionalscreenshotslogs": {
    resourceKey: "m6163636f756e742e737570706f72742e6f7074696f6e616c73637265656e73686f74736c6f6773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.pending": {
    resourceKey: "m6163636f756e742e737570706f72742e70656e64696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.proposalready": {
    resourceKey: "m6163636f756e742e737570706f72742e70726f706f73616c7265616479",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.removingdetails": {
    resourceKey: "m6163636f756e742e737570706f72742e72656d6f76696e6764657461696c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.reply": {
    resourceKey: "m6163636f756e742e737570706f72742e7265706c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.replycouldnotbeconfirmedfileswere": {
    resourceKey: "m6163636f756e742e737570706f72742e7265706c79636f756c646e6f746265636f6e6669726d656466696c657377657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.replyingorchoosingistillneedhelpcancelsthis": {
    resourceKey: "m6163636f756e742e737570706f72742e7265706c79696e676f7263686f6f73696e67697374696c6c6e65656468656c7063616e63656c7374686973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.request2": {
    resourceKey: "m6163636f756e742e737570706f72742e7265717565737432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.requestactions": {
    resourceKey: "m6163636f756e742e737570706f72742e72657175657374616374696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.requestcouldnotbeconfirmedfileswere": {
    resourceKey: "m6163636f756e742e737570706f72742e72657175657374636f756c646e6f746265636f6e6669726d656466696c657377657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.requestnotfound": {
    resourceKey: "m6163636f756e742e737570706f72742e726571756573746e6f74666f756e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.resolved": {
    resourceKey: "m6163636f756e742e737570706f72742e7265736f6c766564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.reviewremoval": {
    resourceKey: "m6163636f756e742e737570706f72742e72657669657772656d6f76616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.reviewrequestagain": {
    resourceKey: "m6163636f756e742e737570706f72742e72657669657772657175657374616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.reviewrequestbeforesendingit": {
    resourceKey: "m6163636f756e742e737570706f72742e726576696577726571756573746265666f726573656e64696e676974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.screenshotsandlogsareusedonlytriage": {
    resourceKey: "m6163636f756e742e737570706f72742e73637265656e73686f7473616e646c6f6773617265757365646f6e6c79747269616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.sendattachmentsagain": {
    resourceKey: "m6163636f756e742e737570706f72742e73656e646174746163686d656e7473616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.servicestatuspage": {
    resourceKey: "m6163636f756e742e737570706f72742e7365727669636573746174757370616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.showsitslatestcheckandanyincidentsolpbchaspost": {
    resourceKey: "m6163636f756e742e737570706f72742e73686f77736974736c6174657374636865636b616e64616e79696e636964656e74736f6c706263686173706f7374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.signinwithyouremailseeyour": {
    resourceKey: "m6163636f756e742e737570706f72742e7369676e696e77697468796f7572656d61696c736565796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.somesenderdetailscouldnotberead": {
    resourceKey: "m6163636f756e742e737570706f72742e736f6d6573656e64657264657461696c73636f756c646e6f74626572656164",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.somesupporthistorycouldnotbeloaded": {
    resourceKey: "m6163636f756e742e737570706f72742e736f6d65737570706f7274686973746f7279636f756c646e6f7462656c6f61646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.somethingelse": {
    resourceKey: "m6163636f756e742e737570706f72742e736f6d657468696e67656c7365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.startnewrequest": {
    resourceKey: "m6163636f756e742e737570706f72742e73746172746e657772657175657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.statusclosed": {
    resourceKey: "m6163636f756e742e737570706f72742e737461747573636c6f736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.telluswhatsgoingonyou": {
    resourceKey: "m6163636f756e742e737570706f72742e74656c6c75737768617473676f696e676f6e796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.thisactioncouldnotbeconfirmedtry": {
    resourceKey: "m6163636f756e742e737570706f72742e74686973616374696f6e636f756c646e6f746265636f6e6669726d6564747279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.thisactiondoesnotmatchearlieraction": {
    resourceKey: "m6163636f756e742e737570706f72742e74686973616374696f6e646f65736e6f746d617463686561726c696572616374696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.thisactionkeyisnotvalidreview": {
    resourceKey: "m6163636f756e742e737570706f72742e74686973616374696f6e6b657969736e6f7476616c6964726576696577",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.thisearlieractioncannolongerbe": {
    resourceKey: "m6163636f756e742e737570706f72742e746869736561726c696572616374696f6e63616e6e6f6c6f6e6765726265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.thisearlieractionispermanentlysuppressedreview": {
    resourceKey: "m6163636f756e742e737570706f72742e746869736561726c696572616374696f6e69737065726d616e656e746c7973757070726573736564726576696577",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.thisrequestchangedbeforethisactioncould": {
    resourceKey: "m6163636f756e742e737570706f72742e74686973726571756573746368616e6765646265666f726574686973616374696f6e636f756c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.thissolvedit": {
    resourceKey: "m6163636f756e742e737570706f72742e74686973736f6c7665646974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.thosefilesdonotmatchearlierbatch": {
    resourceKey: "m6163636f756e742e737570706f72742e74686f736566696c6573646f6e6f746d617463686561726c6965726261746368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.tryagain": {
    resourceKey: "m6163636f756e742e737570706f72742e747279616761696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.tryagainin2": {
    resourceKey: "m6163636f756e742e737570706f72742e747279616761696e696e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.unknownsender": {
    resourceKey: "m6163636f756e742e737570706f72742e756e6b6e6f776e73656e646572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.unreadableattachmentstate": {
    resourceKey: "m6163636f756e742e737570706f72742e756e7265616461626c656174746163686d656e747374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.unreadablestatus": {
    resourceKey: "m6163636f756e742e737570706f72742e756e7265616461626c65737461747573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.updated2": {
    resourceKey: "m6163636f756e742e737570706f72742e7570646174656432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.viewrequest": {
    resourceKey: "m6163636f756e742e737570706f72742e7669657772657175657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.waitingonyou": {
    resourceKey: "m6163636f756e742e737570706f72742e77616974696e676f6e796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.weareremovingsubmitteddetailsthispage": {
    resourceKey: "m6163636f756e742e737570706f72742e776561726572656d6f76696e677375626d697474656464657461696c737468697370616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.wecouldnotfindthatrequest": {
    resourceKey: "m6163636f756e742e737570706f72742e7765636f756c646e6f7466696e647468617472657175657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.wecouldnotreadthatformreview": {
    resourceKey: "m6163636f756e742e737570706f72742e7765636f756c646e6f747265616474686174666f726d726576696577",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.wecouldntfindthatrequest": {
    resourceKey: "m6163636f756e742e737570706f72742e7765636f756c646e7466696e647468617472657175657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.wecouldntloadactiverequeststry": {
    resourceKey: "m6163636f756e742e737570706f72742e7765636f756c646e746c6f61646163746976657265717565737473747279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.wecouldntloadclosedrequeststry": {
    resourceKey: "m6163636f756e742e737570706f72742e7765636f756c646e746c6f6164636c6f7365647265717565737473747279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.wecouldntloadyoursupportright": {
    resourceKey: "m6163636f756e742e737570706f72742e7765636f756c646e746c6f6164796f7572737570706f72747269676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.weneedverifiedemailbeforeyoucan": {
    resourceKey: "m6163636f756e742e737570706f72742e77656e6565647665726966696564656d61696c6265666f7265796f7563616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.whatsgoingon": {
    resourceKey: "m6163636f756e742e737570706f72742e7768617473676f696e676f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.whichproduct": {
    resourceKey: "m6163636f756e742e737570706f72742e776869636870726f64756374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.youcanfollowitrighthere": {
    resourceKey: "m6163636f756e742e737570706f72742e796f7563616e666f6c6c6f776974726967687468657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.yourservices2": {
    resourceKey: "m6163636f756e742e737570706f72742e796f7572736572766963657332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.yoursupport": {
    resourceKey: "m6163636f756e742e737570706f72742e796f7572737570706f7274",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.support.yourversions": {
    resourceKey: "m6163636f756e742e737570706f72742e796f757276657273696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.supportabout.yourversionsmustbetextpasteblock": {
    resourceKey: "m6163636f756e742e737570706f727461626f75742e796f757276657273696f6e736d7573746265746578747061737465626c6f636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.supportdraft.recenterrorstatelines2": {
    resourceKey: "m6163636f756e742e737570706f727464726166742e726563656e746572726f7273746174656c696e657332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.supportdraft.reportfrom2": {
    resourceKey: "m6163636f756e742e737570706f727464726166742e7265706f727466726f6d32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.supportdraft.yourbrowsercouldntsavethisreportforsignincopyi": {
    resourceKey: "m6163636f756e742e737570706f727464726166742e796f757262726f77736572636f756c646e7473617665746869737265706f7274666f727369676e696e636f707969",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.supportforms.working": {
    resourceKey: "m6163636f756e742e737570706f7274666f726d732e776f726b696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.supportforms.yourversionsaretoolongkeepthem": {
    resourceKey: "m6163636f756e742e737570706f7274666f726d732e796f757276657273696f6e73617265746f6f6c6f6e676b6565707468656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.supportforms.yourversionsaretoolongkeepthemunder8192bytes": {
    resourceKey: "m6163636f756e742e737570706f7274666f726d732e796f757276657273696f6e73617265746f6f6c6f6e676b6565707468656d756e646572383139326279746573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.aceteffetleprofessionnelmetaladispositionducon": {
    resourceKey: "m6163636f756e742e7465726d732e6163657465666665746c6570726f66657373696f6e6e656c6d6574616c61646973706f736974696f6e6475636f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.address": {
    resourceKey: "m6163636f756e742e7465726d732e61646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.after30daysoperatedcopyispermanently": {
    resourceKey: "m6163636f756e742e7465726d732e61667465723330646179736f70657261746564636f707969737065726d616e656e746c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.andcarryallthisthroughanysale": {
    resourceKey: "m6163636f756e742e7465726d732e616e646361727279616c6c746869737468726f756768616e7973616c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.articlel2151": {
    resourceKey: "m6163636f756e742e7465726d732e61727469636c656c32313531",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.articlel21511": {
    resourceKey: "m6163636f756e742e7465726d732e61727469636c656c3231353131",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.articlel2152": {
    resourceKey: "m6163636f756e742e7465726d732e61727469636c656c32313532",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.articlel2153": {
    resourceKey: "m6163636f756e742e7465726d732e61727469636c656c32313533",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.articlel2413": {
    resourceKey: "m6163636f756e742e7465726d732e61727469636c656c32343133",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.ccby40": {
    resourceKey: "m6163636f756e742e7465726d732e636362793430",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.createdbynvidiaandusedunder": {
    resourceKey: "m6163636f756e742e7465726d732e6372656174656462796e7669646961616e6475736564756e646572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.date": {
    resourceKey: "m6163636f756e742e7465726d732e64617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.eachsectionbelowcoversoneservicesol": {
    resourceKey: "m6163636f756e742e7465726d732e6561636873656374696f6e62656c6f77636f766572736f6e6573657276696365736f6c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.effectivenovember102026solpbcacoloradopublicbe": {
    resourceKey: "m6163636f756e742e7465726d732e6566666563746976656e6f76656d626572313032303236736f6c70626361636f6c6f7261646f7075626c69636265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.forconsumersinfrancearticlesl2151tol2153andl24": {
    resourceKey: "m6163636f756e742e7465726d732e666f72636f6e73756d657273696e6672616e636561727469636c65736c32313531746f6c32313533616e646c3234",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.howreadtheseterms": {
    resourceKey: "m6163636f756e742e7465726d732e686f777265616474686573657465726d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.ifcourtfindspartthesetermsunenforceable": {
    resourceKey: "m6163636f756e742e7465726d732e6966636f75727466696e64737061727474686573657465726d73756e656e666f72636561626c65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.ifthesetermschangeinwaythat": {
    resourceKey: "m6163636f756e742e7465726d732e696674686573657465726d736368616e6765696e77617974686174",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.iherebygivenoticethatiwithdraw": {
    resourceKey: "m6163636f756e742e7465726d732e69686572656279676976656e6f7469636574686174697769746864726177",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.lesavanceseffectueesapresladernieredatederecon": {
    resourceKey: "m6163636f756e742e7465726d732e6c65736176616e6365736566666563747565657361707265736c616465726e696572656461746564657265636f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.lesdispositionsdupresentarticlesappliquentsans": {
    resourceKey: "m6163636f756e742e7465726d732e6c6573646973706f736974696f6e73647570726573656e7461727469636c65736170706c697175656e7473616e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.lesdispositionsdupresentchapitrealexceptiondel": {
    resourceKey: "m6163636f756e742e7465726d732e6c6573646973706f736974696f6e73647570726573656e746368617069747265616c657863657074696f6e64656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.lesdispositionsdupresentchapitresontegalementa": {
    resourceKey: "m6163636f756e742e7465726d732e6c6573646973706f736974696f6e73647570726573656e746368617069747265736f6e746567616c656d656e7461",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.lorsquecetteinformationneluiapaseteadresseecon": {
    resourceKey: "m6163636f756e742e7465726d732e6c6f72737175656365747465696e666f726d6174696f6e6e656c7569617061736574656164726573736565636f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.lorsqueleprofessionnelnapasprocedeauremboursem": {
    resourceKey: "m6163636f756e742e7465726d732e6c6f72737175656c6570726f66657373696f6e6e656c6e6170617370726f63656465617572656d626f757273656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.lorsquuncontrataeteconcluparvoieelectroniqueou": {
    resourceKey: "m6163636f756e742e7465726d732e6c6f72737175756e636f6e7472617461657465636f6e636c75706172766f6965656c656374726f6e697175656f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n10legaldetails": {
    resourceKey: "m6163636f756e742e7465726d732e6e31306c6567616c64657461696c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n11privatenetworkrelay": {
    resourceKey: "m6163636f756e742e7465726d732e6e3131707269766174656e6574776f726b72656c6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n12encryptedbackupoperatedtier": {
    resourceKey: "m6163636f756e742e7465726d732e6e3132656e637279707465646261636b75706f7065726174656474696572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n13confidentialprocessing": {
    resourceKey: "m6163636f756e742e7465726d732e6e3133636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n14solstoneme": {
    resourceKey: "m6163636f756e742e7465726d732e6e3134736f6c73746f6e656d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n15notifications": {
    resourceKey: "m6163636f756e742e7465726d732e6e31356e6f74696669636174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n16scoutprogram": {
    resourceKey: "m6163636f756e742e7465726d732e6e313673636f757470726f6772616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1accessandwhatyourplanincludes2accessisbysubsc": {
    resourceKey: "m6163636f756e742e7465726d732e6e31616363657373616e6477686174796f7572706c616e696e636c7564657332616363657373697362797375627363",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1accessrecordsnotcontent2toruntheserviceandcon": {
    resourceKey: "m6163636f756e742e7465726d732e6e316163636573737265636f7264736e6f74636f6e74656e7432746f72756e74686573657276696365616e64636f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1afterthe72hourssolpbcdeletestheoperatedbackup": {
    resourceKey: "m6163636f756e742e7465726d732e6e3161667465727468653732686f757273736f6c70626364656c657465737468656f706572617465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1afteryoursubscriptionlapseswekeepyourencrypte": {
    resourceKey: "m6163636f756e742e7465726d732e6e316166746572796f7572737562736372697074696f6e6c617073657377656b656570796f7572656e637279707465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1ajournalthatisntreachableisordinary2yourjourn": {
    resourceKey: "m6163636f756e742e7465726d732e6e31616a6f75726e616c7468617469736e74726561636861626c6569736f7264696e61727932796f75726a6f75726e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1alimitspecifictothisservice2theoperatedcopyis": {
    resourceKey: "m6163636f756e742e7465726d732e6e31616c696d69747370656369666963746f7468697373657276696365327468656f70657261746564636f70796973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1amodelsolpbcrunsitself2ourownmodelweightsserv": {
    resourceKey: "m6163636f756e742e7465726d732e6e31616d6f64656c736f6c70626372756e73697473656c66326f75726f776e6d6f64656c7765696768747373657276",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1arenewalisneverasurprise2onanannualplanweemai": {
    resourceKey: "m6163636f756e742e7465726d732e6e316172656e6577616c69736e65766572617375727072697365326f6e616e616e6e75616c706c616e7765656d6169",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1asecondcopyunlessyouchooseotherwise2anencrypt": {
    resourceKey: "m6163636f756e742e7465726d732e6e31617365636f6e64636f7079756e6c657373796f7563686f6f73656f746865727769736532616e656e6372797074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1blindbyconstruction2therelaypassesencryptedby": {
    resourceKey: "m6163636f756e742e7465726d732e6e31626c696e646279636f6e737472756374696f6e3274686572656c6179706173736573656e637279707465646279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1blindbyconstructionandthisrelayholdsnostateab": {
    resourceKey: "m6163636f756e742e7465726d732e6e31626c696e646279636f6e737472756374696f6e616e647468697372656c6179686f6c64736e6f73746174656162",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1cancelanytimewithnomorestepsthanittooktosubsc": {
    resourceKey: "m6163636f756e742e7465726d732e6e3163616e63656c616e7974696d65776974686e6f6d6f726573746570737468616e6974746f6f6b746f7375627363",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1complimentarymeanscomplimentary2whileyoureana": {
    resourceKey: "m6163636f756e742e7465726d732e6e31636f6d706c696d656e746172796d65616e73636f6d706c696d656e74617279327768696c65796f757265616e61",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1encryptedbyconstructiononlyyoucanreadit2befor": {
    resourceKey: "m6163636f756e742e7465726d732e6e31656e637279707465646279636f6e737472756374696f6e6f6e6c79796f7563616e726561646974326265666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1everythingisshownbeforeyoupay2eachservicehasa": {
    resourceKey: "m6163636f756e742e7465726d732e6e3165766572797468696e67697373686f776e6265666f7265796f7570617932656163687365727669636568617361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1fairusespecifically2confidentialprocessingisf": {
    resourceKey: "m6163636f756e742e7465726d732e6e31666169727573657370656369666963616c6c7932636f6e666964656e7469616c70726f63657373696e67697366",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1fairusespecifically2theoperatedtierisforbacki": {
    resourceKey: "m6163636f756e742e7465726d732e6e31666169727573657370656369666963616c6c79327468656f70657261746564746965726973666f726261636b69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1fairusespecifically2thisisforyourownagentsrea": {
    resourceKey: "m6163636f756e742e7465726d732e6e31666169727573657370656369666963616c6c7932746869736973666f72796f75726f776e6167656e7473726561",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1howitworks2yousigninwithyouremailwesendyouaco": {
    resourceKey: "m6163636f756e742e7465726d732e6e31686f776974776f726b7332796f757369676e696e77697468796f7572656d61696c776573656e64796f7561636f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1ifsomethinggoeswrongwhethertheclaimisaboutase": {
    resourceKey: "m6163636f756e742e7465726d732e6e316966736f6d657468696e67676f657377726f6e6777686574686572746865636c61696d697361626f7574617365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1ifyoupayitrenewsuntilyoucancelandcancelingisa": {
    resourceKey: "m6163636f756e742e7465726d732e6e316966796f75706179697472656e657773756e74696c796f7563616e63656c616e6463616e63656c696e67697361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1ifyoustoppayingforencryptedbackupwekeeptheenc": {
    resourceKey: "m6163636f756e742e7465726d732e6e316966796f7573746f70706179696e67666f72656e637279707465646261636b757077656b656570746865656e63",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1insidethecontainer2theservicekeepsthecountofh": {
    resourceKey: "m6163636f756e742e7465726d732e6e31696e73696465746865636f6e7461696e657232746865736572766963656b65657073746865636f756e746f6668",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1itcanend2scoutstatusisourstograntandourstoend": {
    resourceKey: "m6163636f756e742e7465726d732e6e31697463616e656e643273636f757473746174757369736f757273746f6772616e74616e646f757273746f656e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1itnevertouches2yourjournalonyourdevicesyourde": {
    resourceKey: "m6163636f756e742e7465726d732e6e3169746e65766572746f756368657332796f75726a6f75726e616c6f6e796f757264657669636573796f75726465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1itsprotecteddifferentlyfromourotherthreeservi": {
    resourceKey: "m6163636f756e742e7465726d732e6e3169747370726f746563746564646966666572656e746c7966726f6d6f75726f7468657274687265657365727669",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1itstopstheservicesonyoursigninassoonasyouconf": {
    resourceKey: "m6163636f756e742e7465726d732e6e31697473746f707374686573657276696365736f6e796f75727369676e696e6173736f6f6e6173796f75636f6e66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1itsyourstokeepsafe2asigninisforonepersonkeepy": {
    resourceKey: "m6163636f756e742e7465726d732e6e31697473796f757273746f6b6565707361666532617369676e696e6973666f726f6e65706572736f6e6b65657079",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1notatrackingsurface2noanalyticsnobehavioralpr": {
    resourceKey: "m6163636f756e742e7465726d732e6e316e6f7461747261636b696e6773757266616365326e6f616e616c79746963736e6f6265686176696f72616c7072",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1nothinghereisrequired2thesolstonesoftwareruns": {
    resourceKey: "m6163636f756e742e7465726d732e6e316e6f7468696e67686572656973726571756972656432746865736f6c73746f6e65736f66747761726572756e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1nothingonyourdevicesislostwhenaservicestopswi": {
    resourceKey: "m6163636f756e742e7465726d732e6e316e6f7468696e676f6e796f75726465766963657369736c6f73747768656e617365727669636573746f70737769",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1nothingyousendisusedtotrainanything2notourmod": {
    resourceKey: "m6163636f756e742e7465726d732e6e316e6f7468696e67796f7573656e64697375736564746f747261696e616e797468696e67326e6f746f75726d6f64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1onthedeviceandonyourphone2aheadsupcanbealocal": {
    resourceKey: "m6163636f756e742e7465726d732e6e316f6e746865646576696365616e646f6e796f757270686f6e6532616865616473757063616e6265616c6f63616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1questionsandcomplaints2supportsolstoneappor15": {
    resourceKey: "m6163636f756e742e7465726d732e6e317175657374696f6e73616e64636f6d706c61696e747332737570706f7274736f6c73746f6e656170706f723135",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1refunds2awithdrawalwithin14daysrefundseveryth": {
    resourceKey: "m6163636f756e742e7465726d732e6e31726566756e647332617769746864726177616c77697468696e313464617973726566756e647365766572797468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1servicessolstoneapp2theservicesportalwhereyou": {
    resourceKey: "m6163636f756e742e7465726d732e6e317365727669636573736f6c73746f6e65617070327468657365727669636573706f7274616c7768657265796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1somethingsoutlastitandtheprivacypolicynamesth": {
    resourceKey: "m6163636f756e742e7465726d732e6e31736f6d657468696e67736f75746c6173746974616e6474686570726976616379706f6c6963796e616d65737468",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1theagentisyoursandthecompanybehinditisntours2": {
    resourceKey: "m6163636f756e742e7465726d732e6e317468656167656e746973796f757273616e64746865636f6d70616e79626568696e64697469736e746f75727332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1thecovenants2ourarticlesofincorporationcarrya": {
    resourceKey: "m6163636f756e742e7465726d732e6e31746865636f76656e616e7473326f757261727469636c65736f66696e636f72706f726174696f6e636172727961",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1thehardwareismicrosoftazuresandazurecantseein": {
    resourceKey: "m6163636f756e742e7465726d732e6e31746865686172647761726569736d6963726f736f6674617a75726573616e64617a75726563616e74736565696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1thehopforiphone2reachinganiphoneneedsahopbeca": {
    resourceKey: "m6163636f756e742e7465726d732e6e31746865686f70666f726970686f6e65327265616368696e67616e6970686f6e656e6565647361686f7062656361",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1theprivacypolicyisthehomeforallofthisanditisp": {
    resourceKey: "m6163636f756e742e7465726d732e6e3174686570726976616379706f6c6963796973746865686f6d65666f72616c6c6f6674686973616e646974697370",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1thesolstoneapphasnosigninofitsown2theportalis": {
    resourceKey: "m6163636f756e742e7465726d732e6e31746865736f6c73746f6e656170706861736e6f7369676e696e6f666974736f776e32746865706f7274616c6973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1thesolstoneservices2solpbcrunsforyouprivatene": {
    resourceKey: "m6163636f756e742e7465726d732e6e31746865736f6c73746f6e65736572766963657332736f6c70626372756e73666f72796f75707269766174656e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1tothefullestextentpermittedbylaweachserviceis": {
    resourceKey: "m6163636f756e742e7465726d732e6e31746f74686566756c6c657374657874656e747065726d697474656462796c617765616368736572766963656973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1turningitoff2turnitofffromthejournalanytimean": {
    resourceKey: "m6163636f756e742e7465726d732e6e317475726e696e6769746f6666327475726e69746f666666726f6d7468656a6f75726e616c616e7974696d65616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1turningitoff2turnnotificationsoffonanydevicea": {
    resourceKey: "m6163636f756e742e7465726d732e6e317475726e696e6769746f6666327475726e6e6f74696669636174696f6e736f66666f6e616e7964657669636561",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1turningitoffandhowquicklythattakeseffect2turn": {
    resourceKey: "m6163636f756e742e7465726d732e6e317475726e696e6769746f6666616e64686f77717569636b6c797468617474616b6573656666656374327475726e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1wekeepnoconnectionmetadataforthisservice2beyo": {
    resourceKey: "m6163636f756e742e7465726d732e6e3177656b6565706e6f636f6e6e656374696f6e6d65746164617461666f727468697373657276696365326265796f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1weneverselllicensesublicenseorleaseyourdataan": {
    resourceKey: "m6163636f756e742e7465726d732e6e3177656e6576657273656c6c6c6963656e73657375626c6963656e73656f726c65617365796f757264617461616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1wetellyoubeforeapricechanges2apricechangeisam": {
    resourceKey: "m6163636f756e742e7465726d732e6e31776574656c6c796f756265666f72656170726963656368616e676573326170726963656368616e67656973616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whataservicehandlestodoitsjob2isinitssectioni": {
    resourceKey: "m6163636f756e742e7465726d732e6e3177686174617365727669636568616e646c6573746f646f6974736a6f62326973696e69747373656374696f6e69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whateachagentmayseeisyourstosetandwerenotinit": {
    resourceKey: "m6163636f756e742e7465726d732e6e3177686174656163686167656e746d61797365656973796f757273746f736574616e64776572656e6f74696e6974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatitis2anaddressontheinternetforyourjournal": {
    resourceKey: "m6163636f756e742e7465726d732e6e31776861746974697332616e616464726573736f6e746865696e7465726e6574666f72796f75726a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatitis2anaimodelsolpbcrunsonconfidentialgpu": {
    resourceKey: "m6163636f756e742e7465726d732e6e31776861746974697332616e61696d6f64656c736f6c70626372756e736f6e636f6e666964656e7469616c677075",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatitis2arelaysolpbcrunssoyourdevicescanreac": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768617469746973326172656c6179736f6c70626372756e73736f796f75726465766963657363616e72656163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatitis2notificationsarebuiltintothesolstone": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768617469746973326e6f74696669636174696f6e736172656275696c74696e746f746865736f6c73746f6e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatitis2storagesolpbcrunssoanencryptedcopyof": {
    resourceKey: "m6163636f756e742e7465726d732e6e3177686174697469733273746f72616765736f6c70626372756e73736f616e656e63727970746564636f70796f66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatsuspensioncantouchandwhatitnevercan2susta": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768617473757370656e73696f6e63616e746f756368616e647768617469746e6576657263616e327375737461",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatthemodelproducesisnotadviceandnobodycheck": {
    resourceKey: "m6163636f756e742e7465726d732e6e31776861747468656d6f64656c70726f647563657369736e6f74616476696365616e646e6f626f6479636865636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whattherelayhandlesandwhatwekeep2tomoveyourby": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768617474686572656c617968616e646c6573616e647768617477656b65657032746f6d6f7665796f75726279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whattheservicesworkwith2eachserviceworkswitht": {
    resourceKey: "m6163636f756e742e7465726d732e6e31776861747468657365727669636573776f726b77697468326561636873657276696365776f726b737769746874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatthestoragehandlesandwhatwekeep2theencrypt": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768617474686573746f7261676568616e646c6573616e647768617477656b65657032746865656e6372797074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatthisrelayandourcontrolplanehandleandwhatw": {
    resourceKey: "m6163636f756e742e7465726d732e6e31776861747468697372656c6179616e646f7572636f6e74726f6c706c616e6568616e646c65616e647768617477",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatweholdforasignin2theprivacypolicylistseac": {
    resourceKey: "m6163636f756e742e7465726d732e6e31776861747765686f6c64666f72617369676e696e3274686570726976616379706f6c6963796c69737473656163",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatweholdissmallnamedandmostlyyourstoseeexpo": {
    resourceKey: "m6163636f756e742e7465726d732e6e31776861747765686f6c646973736d616c6c6e616d6564616e646d6f73746c79796f757273746f7365656578706f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatwekeep2runningthisserviceinvolvesafewdiff": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768617477656b6565703272756e6e696e677468697373657276696365696e766f6c7665736166657764696666",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatwekeep2yourapplicationyouracknowledgmento": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768617477656b65657032796f75726170706c69636174696f6e796f757261636b6e6f776c6564676d656e746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whatyousendthemodel2thetextandimagesyourjourn": {
    resourceKey: "m6163636f756e742e7465726d732e6e3177686174796f7573656e647468656d6f64656c3274686574657874616e64696d61676573796f75726a6f75726e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whenacanceltakeseffect2onamonthlyplanandinthe": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768656e6163616e63656c74616b6573656666656374326f6e616d6f6e74686c79706c616e616e64696e746865",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whenitstops2cancelorletitlapseandconfidential": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768656e697473746f70733263616e63656c6f726c657469746c61707365616e64636f6e666964656e7469616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whenitstops2cancelorletitlapseandtherelaykeep": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768656e697473746f70733263616e63656c6f726c657469746c61707365616e6474686572656c61796b656570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whenitstops2cancelorletitlapseandthesolstonem": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768656e697473746f70733263616e63656c6f726c657469746c61707365616e64746865736f6c73746f6e656d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whenthe72hoursareupitendsyoursubscriptions2ev": {
    resourceKey: "m6163636f756e742e7465726d732e6e317768656e7468653732686f75727361726575706974656e6473796f7572737562736372697074696f6e73326576",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whoprocessesdataforus2cloudflaremicrosoftazur": {
    resourceKey: "m6163636f756e742e7465726d732e6e3177686f70726f63657373657364617461666f72757332636c6f7564666c6172656d6963726f736f6674617a7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1whothesetermsarebetweenand": {
    resourceKey: "m6163636f756e742e7465726d732e6e3177686f74686573657465726d736172656265747765656e616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1withdrawalform2fillthisinandsenditonlyifyouwa": {
    resourceKey: "m6163636f756e742e7465726d732e6e317769746864726177616c666f726d3266696c6c74686973696e616e6473656e6469746f6e6c796966796f757761",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1youcanalwaysturnaserviceoffandwhatsolpbcrunsf": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f7563616e616c776179737475726e61736572766963656f6666616e6477686174736f6c70626372756e7366",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1youcanwithdrawwithin14daysforafullrefundwhere": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f7563616e776974686472617777697468696e313464617973666f726166756c6c726566756e647768657265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1youhave72hourstochangeyourmind2keepyoursignin": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f75686176653732686f757273746f6368616e6765796f75726d696e64326b656570796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1youneverhavetopayus2pointsolstoneatyourownbuc": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f756e6576657268617665746f706179757332706f696e74736f6c73746f6e656174796f75726f776e627563",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1youneverhavetopayus2thesameprivateconnectioni": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f756e6576657268617665746f70617975733274686573616d6570726976617465636f6e6e656374696f6e69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1youneverhavetopayus2thisiscapacitynotagateyou": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f756e6576657268617665746f70617975733274686973697363617061636974796e6f746167617465796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1youneverhavetopayus2yourjournaldoesntneedsolp": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f756e6576657268617665746f706179757332796f75726a6f75726e616c646f65736e746e656564736f6c70",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1youraddressisneveranyoneelses2anaddressoncemi": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f75726164647265737369736e65766572616e796f6e65656c73657332616e616464726573736f6e63656d69",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1yourjournalchecksbeforeitsends2beforeanything": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f75726a6f75726e616c636865636b736265666f7265697473656e6473326265666f7265616e797468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1yourjournalsaddressandthepartofitthatisperman": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f75726a6f75726e616c7361646472657373616e64746865706172746f6669747468617469737065726d616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1yourrecoverykeyistheonlykey2whenyousetupbacku": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f75727265636f766572796b657969737468656f6e6c796b6579327768656e796f7573657475706261636b75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1yourrightsasaconsumer2ifaserviceisntasdescrib": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f7572726967687473617361636f6e73756d6572326966617365727669636569736e74617364657363726962",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1yoursubscriptionrenewsautomatically2attheendo": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f7572737562736372697074696f6e72656e6577736175746f6d61746963616c6c79326174746865656e646f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n1youruseismeteredinsidethecontainer2theservice": {
    resourceKey: "m6163636f756e742e7465726d732e6e31796f757275736569736d657465726564696e73696465746865636f6e7461696e65723274686573657276696365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n2yoursignin": {
    resourceKey: "m6163636f756e742e7465726d732e6e32796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n3payingrenewingandcanceling": {
    resourceKey: "m6163636f756e742e7465726d732e6e33706179696e6772656e6577696e67616e6463616e63656c696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n4paymentishandledbystripe": {
    resourceKey: "m6163636f756e742e7465726d732e6e347061796d656e74697368616e646c65646279737472697065",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n5fairuse": {
    resourceKey: "m6163636f756e742e7465726d732e6e3566616972757365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n6howyourdataisusedand": {
    resourceKey: "m6163636f756e742e7465726d732e6e36686f77796f757264617461697375736564616e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n7howlongwekeepitclosing": {
    resourceKey: "m6163636f756e742e7465726d732e6e37686f776c6f6e6777656b6565706974636c6f73696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n8servicesareprovidedasis": {
    resourceKey: "m6163636f756e742e7465726d732e6e38736572766963657361726570726f766964656461736973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.n9changestheseterms": {
    resourceKey: "m6163636f756e742e7465726d732e6e396368616e67657374686573657465726d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.name": {
    resourceKey: "m6163636f756e742e7465726d732e6e616d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.neverhanditoutsidesolpbcexcept": {
    resourceKey: "m6163636f756e742e7465726d732e6e6576657268616e6469746f757473696465736f6c706263657863657074",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.neverselllicensesublicenseorleaseyour": {
    resourceKey: "m6163636f756e742e7465726d732e6e6576657273656c6c6c6963656e73657375626c6963656e73656f726c65617365796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.neveruseitfortargetedadvertisingor": {
    resourceKey: "m6163636f756e742e7465726d732e6e657665727573656974666f7274617267657465646164766572746973696e676f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.nochangethesetermscanweakencovenants": {
    resourceKey: "m6163636f756e742e7465726d732e6e6f6368616e676574686573657465726d7363616e7765616b656e636f76656e616e7473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.onbydefault": {
    resourceKey: "m6163636f756e742e7465726d732e6f6e627964656661756c74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.orderedon": {
    resourceKey: "m6163636f756e742e7465726d732e6f7264657265646f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.paidservicesrenewautomaticallyasubscriptionren": {
    resourceKey: "m6163636f756e742e7465726d732e70616964736572766963657372656e65776175746f6d61746963616c6c7961737562736372697074696f6e72656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.parexceptionaupremieralineadupresentarticlepou": {
    resourceKey: "m6163636f756e742e7465726d732e706172657863657074696f6e61757072656d696572616c696e6561647570726573656e7461727469636c65706f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.partonewhatapplieseverything": {
    resourceKey: "m6163636f756e742e7465726d732e706172746f6e65776861746170706c69657365766572797468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.parttwoeachserviceoneattime": {
    resourceKey: "m6163636f756e742e7465726d732e7061727474776f65616368736572766963656f6e65617474696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.pourlescontratsdeprestationsdeservicesconclusp": {
    resourceKey: "m6163636f756e742e7465726d732e706f75726c6573636f6e7472617473646570726573746174696f6e7364657365727669636573636f6e636c757370",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.scoutissolpbcstesterprogram": {
    resourceKey: "m6163636f756e742e7465726d732e73636f75746973736f6c7062637374657374657270726f6772616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.scoutprogram": {
    resourceKey: "m6163636f756e742e7465726d732e73636f757470726f6772616d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.servicesareforyouyourownjournal": {
    resourceKey: "m6163636f756e742e7465726d732e7365727669636573617265666f72796f75796f75726f776e6a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.shortversion": {
    resourceKey: "m6163636f756e742e7465726d732e73686f727476657273696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.shortversionissummarysectionsbelowcarry": {
    resourceKey: "m6163636f756e742e7465726d732e73686f727476657273696f6e697373756d6d61727973656374696f6e7362656c6f776361727279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.signatureonlyifyousendthison": {
    resourceKey: "m6163636f756e742e7465726d732e7369676e61747572656f6e6c796966796f7573656e64746869736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.solpbc16095east109thplacecommerce": {
    resourceKey: "m6163636f756e742e7465726d732e736f6c7062633136303935656173743130397468706c616365636f6d6d65726365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.solstoneservicesterms": {
    resourceKey: "m6163636f756e742e7465726d732e736f6c73746f6e6573657276696365737465726d73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.speech": {
    resourceKey: "m6163636f756e742e7465726d732e737065656368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.striperunsthefraudandantimoneylaunderingchecks": {
    resourceKey: "m6163636f756e742e7465726d732e73747269706572756e737468656672617564616e64616e74696d6f6e65796c61756e646572696e67636865636b73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.theoperatedstoragekeepsrunninguntilyoursubscri": {
    resourceKey: "m6163636f756e742e7465726d732e7468656f7065726174656473746f726167656b6565707372756e6e696e67756e74696c796f757273756273637269",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.theprivacypolicysetsouteachoftheseinfullitscit": {
    resourceKey: "m6163636f756e742e7465726d732e74686570726976616379706f6c696379736574736f7574656163686f667468657365696e66756c6c697473636974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.thesamemodelgenerationyourowndevicerunstheswit": {
    resourceKey: "m6163636f756e742e7465726d732e74686573616d656d6f64656c67656e65726174696f6e796f75726f776e64657669636572756e7374686573776974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.thesetermsareacontractbetweenyouand1solpbc2aco": {
    resourceKey: "m6163636f756e742e7465726d732e74686573657465726d7361726561636f6e74726163746265747765656e796f75616e6431736f6c7062633261636f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.thesetermsarebetweenyouand1solpbc2acoloradopub": {
    resourceKey: "m6163636f756e742e7465726d732e74686573657465726d736172656265747765656e796f75616e6431736f6c7062633261636f6c6f7261646f707562",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.thesetermscover1servicessolstoneapp2theplaceyo": {
    resourceKey: "m6163636f756e742e7465726d732e74686573657465726d73636f766572317365727669636573736f6c73746f6e6561707032746865706c616365796f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.thesetermsdescribeservicessolpbcruns": {
    resourceKey: "m6163636f756e742e7465726d732e74686573657465726d7364657363726962657365727669636573736f6c70626372756e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.thesetermsprivacypolicydisclosureyoure": {
    resourceKey: "m6163636f756e742e7465726d732e74686573657465726d7370726976616379706f6c696379646973636c6f73757265796f757265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.theydontcoversolstonesoftwareitself": {
    resourceKey: "m6163636f756e742e7465726d732e74686579646f6e74636f766572736f6c73746f6e65736f667477617265697473656c66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.thissectionappliesanyserviceyousubscribe": {
    resourceKey: "m6163636f756e742e7465726d732e7468697373656374696f6e6170706c696573616e7973657276696365796f75737562736372696265",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.twootherdocumentsgowiththesetermsthe1privacypo": {
    resourceKey: "m6163636f756e742e7465726d732e74776f6f74686572646f63756d656e7473676f7769746874686573657465726d737468653170726976616379706f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.undecretfixenotammentlesmodalitestechniquesden": {
    resourceKey: "m6163636f756e742e7465726d732e756e646563726574666978656e6f74616d6d656e746c65736d6f64616c69746573746563686e697175657364656e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.wecanhandthesetermsoryour": {
    resourceKey: "m6163636f756e742e7465726d732e776563616e68616e6474686573657465726d736f72796f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.wedonttakeorstoreyourcardpaymentsrunthrough1st": {
    resourceKey: "m6163636f756e742e7465726d732e7765646f6e7474616b656f7273746f7265796f7572636172647061796d656e747372756e7468726f756768317374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.wemayupdatethesetermsifchange": {
    resourceKey: "m6163636f756e742e7465726d732e77656d617975706461746574686573657465726d7369666368616e6765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.weworkkeepeveryserviceupbut": {
    resourceKey: "m6163636f756e742e7465726d732e7765776f726b6b6565706576657279736572766963657570627574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.whatwesendstripewhatwekeepfromwhatitsendsbacka": {
    resourceKey: "m6163636f756e742e7465726d732e77686174776573656e647374726970657768617477656b65657066726f6d77686174697473656e64736261636b61",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.wheneverconfidentialprocessingisinuseandthepag": {
    resourceKey: "m6163636f756e742e7465726d732e7768656e65766572636f6e666964656e7469616c70726f63657373696e676973696e757365616e64746865706167",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.whensectionsaysweemailyouwe": {
    resourceKey: "m6163636f756e742e7465726d732e7768656e73656374696f6e736179737765656d61696c796f757765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.whentheaudioswitchisonyourjournalsendsspeechfo": {
    resourceKey: "m6163636f756e742e7465726d732e7768656e746865617564696f73776974636869736f6e796f75726a6f75726e616c73656e6473737065656368666f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.whenweaddserviceweaddits": {
    resourceKey: "m6163636f756e742e7465726d732e7768656e7765616464736572766963657765616464697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.youagreethesetermsfirsttimeyou": {
    resourceKey: "m6163636f756e742e7465726d732e796f75616772656574686573657465726d73666972737474696d65796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.youcanalsodeleteoperatedcopyyourself": {
    resourceKey: "m6163636f756e742e7465726d732e796f7563616e616c736f64656c6574656f70657261746564636f7079796f757273656c66",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.youhaveprivacyrightsyourstateor": {
    resourceKey: "m6163636f756e742e7465726d732e796f756861766570726976616379726967687473796f757273746174656f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.youneedbeatleast13sign": {
    resourceKey: "m6163636f756e742e7465726d732e796f756e656564626561746c6561737431337369676e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.yourencryptedblocksthenstayinour": {
    resourceKey: "m6163636f756e742e7465726d732e796f7572656e63727970746564626c6f636b737468656e73746179696e6f7572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.terms.yourjournalisalwaysprivateonlyyoursand1nothing": {
    resourceKey: "m6163636f756e742e7465726d732e796f75726a6f75726e616c6973616c77617973707269766174656f6e6c79796f757273616e64316e6f7468696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.active": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e616374697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.added": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6164646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.address": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.applied": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6170706c696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.approved": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e617070726f766564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.atmostoncealertsforsolstoneme": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61746d6f73746f6e6365616c65727473666f72736f6c73746f6e656d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.atmostonceclaimsforidentityfree": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61746d6f73746f6e6365636c61696d73666f726964656e7469747966726565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.authenticationcapabilitymetadata": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61757468656e7469636174696f6e6361706162696c6974796d65746164617461",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.authenticationchallenge": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61757468656e7469636174696f6e6368616c6c656e6765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.authenticationcredentialidentifier": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61757468656e7469636174696f6e63726564656e7469616c6964656e746966696572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.authenticationhash": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61757468656e7469636174696f6e68617368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.authenticationmaterial": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61757468656e7469636174696f6e6d6174657269616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.authenticationreplaystate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61757468656e7469636174696f6e7265706c61797374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.authenticationtransportmetadata": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61757468656e7469636174696f6e7472616e73706f72746d65746164617461",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.authenticatorfingerprint": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e61757468656e74696361746f7266696e6765727072696e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.backupsdeletedafterencryptedbackupended": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6261636b75707364656c657465646166746572656e637279707465646261636b7570656e646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.boolean": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e626f6f6c65616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.brokerauthenticationhash": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e62726f6b657261757468656e7469636174696f6e68617368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.brokerauthorizationscope": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e62726f6b6572617574686f72697a6174696f6e73636f7065",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.brokerreservationcoordinate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e62726f6b65727265736572766174696f6e636f6f7264696e617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.brokerreservationidentifier": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e62726f6b65727265736572766174696f6e6964656e746966696572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.brokerstoragecoordinate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e62726f6b657273746f72616765636f6f7264696e617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.by": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.cancellationsyoudeclared": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e63616e63656c6c6174696f6e73796f756465636c61726564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.centstaxincluded": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e63656e7473746178696e636c75646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.clearedatcompletion": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e636c65617265646174636f6d706c6574696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.completeddeletionrecordkeptwithoutanautomatic": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e636f6d706c6574656464656c6574696f6e7265636f72646b657074776974686f7574616e6175746f6d61746963",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.completiontime": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e636f6d706c6574696f6e74696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.confidentialprocessing": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.confirmation": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e636f6e6669726d6174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.created": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e63726561746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.created2": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6372656174656432",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.datatransparency": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e646174617472616e73706172656e6379",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.deletionintegritydigest": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e64656c6574696f6e696e74656772697479646967657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.deletionmachinery": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e64656c6574696f6e6d616368696e657279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.derivedratelimitkey": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e64657269766564726174656c696d69746b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.deviceandbrowserlabel": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e646576696365616e6462726f777365726c6162656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.downloadwhatsolpbcholds": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e646f776e6c6f616477686174736f6c706263686f6c6473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.downloadwhatsolpbcholds2": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e646f776e6c6f616477686174736f6c706263686f6c647332",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.eachtimejournalaskedforbackupaccess": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6561636874696d656a6f75726e616c61736b6564666f726261636b7570616363657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.eachtimejournalaskedforconfidentialprocessing": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6561636874696d656a6f75726e616c61736b6564666f72636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.emailaddressesattachedyoursignin": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e656d61696c6164647265737365736174746163686564796f75727369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.emaillookuphash": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e656d61696c6c6f6f6b757068617368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.emails": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e656d61696c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.encryptedatrest": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e656e63727970746564617472657374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.encryptedatrestshortenedfordisplay": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e656e6372797074656461747265737473686f7274656e6564666f72646973706c6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.encryptedbackup": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.encryptedhandoffcredential": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e656e6372797074656468616e646f666663726564656e7469616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.expires": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e65787069726573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.from": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e66726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.historyyourscoutstatus": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e686973746f7279796f757273636f7574737461747573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.hostnamereservationskeptafterdeletionsoan": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e686f73746e616d657265736572766174696f6e736b657074616674657264656c6574696f6e736f616e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.id": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.identifierfreecompletionverifier": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6964656e74696669657266726565636f6d706c6574696f6e7665726966696572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.identifierfreedeletionreceiptkeptonlyuntil": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6964656e7469666965726672656564656c6574696f6e726563656970746b6570746f6e6c79756e74696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.internalownerrelation": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e696e7465726e616c6f776e657272656c6174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.internalrelationkey": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e696e7465726e616c72656c6174696f6e6b6579",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.journal": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.journalsconnectedconfidentialprocessingandwhenyou": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6a6f75726e616c73636f6e6e6563746564636f6e666964656e7469616c70726f63657373696e67616e647768656e796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.journalsconnectedencryptedbackup": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6a6f75726e616c73636f6e6e6563746564656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.journalsconnectedprivatenetwork": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6a6f75726e616c73636f6e6e6563746564707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.journalsconnectedsolstonemeandwhenyou": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6a6f75726e616c73636f6e6e6563746564736f6c73746f6e656d65616e647768656e796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.lapsed": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6c6170736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.lastactive": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6c617374616374697665",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.lastsignin": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6c6173747369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.lastused": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6c61737475736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.lookuphash": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6c6f6f6b757068617368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.manage3": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6d616e61676533",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.manageemails": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6d616e616765656d61696c73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.managepasskeys": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6d616e616765706173736b657973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.managesessions": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6d616e61676573657373696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.managesignin": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6d616e6167657369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.managesignin2": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6d616e6167657369676e696e32",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.millisecondsclaimnotanexpiry": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6d696c6c697365636f6e6473636c61696d6e6f74616e657870697279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.millisecondssinceunixepoch": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6d696c6c697365636f6e647373696e6365756e697865706f6368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.minimumconfirmedrelaysupportenvelopeexpiry": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6d696e696d756d636f6e6669726d656472656c6179737570706f7274656e76656c6f7065657870697279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.nameyougavethispasskeyorits": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6e616d65796f756761766574686973706173736b65796f72697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.networkaddresshash": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6e6574776f726b6164647265737368617368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.noneheld": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6e6f6e6568656c64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.nopasskeys": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6e6f706173736b657973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.nosessions": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6e6f73657373696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.on": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.operationaldnsverificationstate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6f7065726174696f6e616c646e73766572696669636174696f6e7374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.operatormarkerforsolpbctestsign": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6f70657261746f726d61726b6572666f72736f6c706263746573747369676e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.operatorserviceorinternalowneridentifier": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6f70657261746f72736572766963656f72696e7465726e616c6f776e65726964656e746966696572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.operatorsessionlabel": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6f70657261746f7273657373696f6e6c6162656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.otherrecords": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e6f746865727265636f726473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.paid": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e70616964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.passkeys": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e706173736b657973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.passkeysincludingrevokedpasskeys": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e706173736b657973696e636c7564696e677265766f6b6564706173736b657973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.peppereddigestthatsuppressesduplicatesend": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e706570706572656464696765737474686174737570707265737365736475706c696361746573656e64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.permanenthostnamereservationwithnoaccountjoin": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7065726d616e656e74686f73746e616d657265736572766174696f6e776974686e6f6163636f756e746a6f696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.pinned": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e70696e6e6564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.primary": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7072696d617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.privatenetwork": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.proofauthenticationchallenge": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e70726f6f6661757468656e7469636174696f6e6368616c6c656e6765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.proofauthenticationhash": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e70726f6f6661757468656e7469636174696f6e68617368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.reason": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e726561736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.reference": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7265666572656e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.refused": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72656675736564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.relaysrecordforyourjournalcouldn": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72656c6179737265636f7264666f72796f75726a6f75726e616c636f756c646e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.renewalnoticessentyou": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72656e6577616c6e6f746963657373656e74796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.renews": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72656e657773",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.reservationcreationtimeremainswithpermanentlabel": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7265736572766174696f6e6372656174696f6e74696d6572656d61696e73776974687065726d616e656e746c6162656c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedattemptcount": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e6564617474656d7074636f756e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedbackupemptyobservation": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e65646261636b7570656d7074796f62736572766174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedbackupsafetyobservation": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e65646261636b75707361666574796f62736572766174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedbillingdeletionattempttime": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e656462696c6c696e6764656c6574696f6e617474656d707474696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedbillingdeletiondisposition": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e656462696c6c696e6764656c6574696f6e646973706f736974696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedcancellationboundary": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e656463616e63656c6c6174696f6e626f756e64617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedcancellationtime": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e656463616e63656c6c6174696f6e74696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedcompletiontime": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e6564636f6d706c6574696f6e74696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retaineddeletionoperationidentifier": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e656464656c6574696f6e6f7065726174696f6e6964656e746966696572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retaineddeletionrequesttime": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e656464656c6574696f6e7265717565737474696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedfreezetime": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e6564667265657a6574696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedlastboundederrorcategory": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e65646c617374626f756e6465646572726f7263617465676f7279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedlasterrortime": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e65646c6173746572726f7274696d65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedlastschedulingcoordinate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e65646c6173747363686564756c696e67636f6f7264696e617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retainedterminaldeletiondisposition": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e72657461696e65647465726d696e616c64656c6574696f6e646973706f736974696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retiredauthenticationcoordinate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7265746972656461757468656e7469636174696f6e636f6f7264696e617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retiredbackupauthenticationtokens": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e726574697265646261636b757061757468656e7469636174696f6e746f6b656e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retiredbrokerauthenticationhash": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7265746972656462726f6b657261757468656e7469636174696f6e68617368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.retiredtransientscoutenablecodes": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e726574697265647472616e7369656e7473636f7574656e61626c65636f646573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.revoked2": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7265766f6b656432",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.transparency.revoked3": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7265766f6b656433",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.rotated": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e726f7461746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.scout": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e73636f7574",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.secondssinceunixepoch": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7365636f6e647373696e6365756e697865706f6368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.secondssinceunixepochorsentinel0": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7365636f6e647373696e6365756e697865706f63686f7273656e74696e656c30",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.sessionauthenticationhash": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e73657373696f6e61757468656e7469636174696f6e68617368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.sessions": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e73657373696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.signin": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.signinid": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7369676e696e6964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.signinmanageyourservices": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7369676e696e6d616e616765796f75727365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.signinsessionsincludingrevokedsessions": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7369676e696e73657373696f6e73696e636c7564696e677265766f6b656473657373696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.signintomanageyourservices": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7369676e696e746f6d616e616765796f75727365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.singlecapacityslotwithnoaccountid": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e73696e676c656361706163697479736c6f74776974686e6f6163636f756e746964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.solpbcdoesntknowwhoyou": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e736f6c706263646f65736e746b6e6f7777686f796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.solstonemeaddressheldforeachjournal": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e736f6c73746f6e656d656164647265737368656c64666f72656163686a6f75726e616c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.solstoneservices": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e736f6c73746f6e657365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.stableidentifier": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e737461626c656964656e746966696572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.stripecheckoutreference": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e737472697065636865636b6f75747265666572656e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.stripecustomerreference": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e737472697065637573746f6d65727265666572656e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.stripeinvoicereference": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e737472697065696e766f6963657265666572656e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.stripesubscriptionreference": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e737472697065737562736372697074696f6e7265666572656e6365",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.structureiscommitmentwhatweholdfor": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7374727563747572656973636f6d6d69746d656e74776861747765686f6c64666f72",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.subscriptionsyouwithdrewfromwithin14days": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e737562736372697074696f6e73796f75776974686472657766726f6d77697468696e313464617973",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.supportrequests": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e737570706f72747265717565737473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.terminalcompletionstate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7465726d696e616c636f6d706c6574696f6e7374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.timestamplastcapacityalertwithnoaccount": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e74696d657374616d706c6173746361706163697479616c657274776974686e6f6163636f756e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.to": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e746f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientauthenticationstate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e7461757468656e7469636174696f6e7374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientbackupcredentialreservations": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e746261636b757063726564656e7469616c7265736572766174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientbrokerstate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e7462726f6b65727374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientdeletionexportandcredentialchangeproofs": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e7464656c6574696f6e6578706f7274616e6463726564656e7469616c6368616e676570726f6f6673",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientdevicedispatchtokens": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e746465766963656469737061746368746f6b656e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientdnsleasestate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e74646e736c656173657374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientemailsignincodes": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e74656d61696c7369676e696e636f646573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transienthandoffstate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e7468616e646f66667374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientpasskeychallenges": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e74706173736b65796368616c6c656e676573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientpeerdeletionoperations": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e747065657264656c6574696f6e6f7065726174696f6e73",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientproofstate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e7470726f6f667374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientratelimits": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e74726174656c696d697473",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientratestate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e74726174657374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientservicehandoffs": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e747365727669636568616e646f666673",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.transientverificationstate": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7472616e7369656e74766572696669636174696f6e7374617465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.type": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e74797065",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.unverified": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e756e7665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.updated": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e75706461746564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.verified": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7665726966696564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.wedonthaveanythingaboutyou": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7765646f6e7468617665616e797468696e6761626f7574796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.whenyouaskedforservicestartright": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7768656e796f7561736b6564666f727365727669636573746172747269676874",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.whetheritendedthesubscriptionthedayitwasmade": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e776865746865726974656e646564746865737562736372697074696f6e74686564617969747761736d616465",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.whetheritendsattheendofthepaidperiod": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e776865746865726974656e64736174746865656e646f6674686570616964706572696f64",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.whetheritwasacancelforaseriousreason": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e7768657468657269747761736163616e63656c666f7261736572696f7573726561736f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.wholemonthsrefunded": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e77686f6c656d6f6e746873726566756e646564",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.you": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e796f75",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.yourcustomerreferenceatstripeourpayment": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e796f7572637573746f6d65727265666572656e636561747374726970656f75727061796d656e74",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.yourscoutapplication": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e796f757273636f75746170706c69636174696f6e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.yourservices": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e796f75727365727669636573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.yourservicesandtheirstatus": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e796f75727365727669636573616e647468656972737461747573",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.yoursolstoneservicessignin": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e796f7572736f6c73746f6e6573657276696365737369676e696e",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.yoursupportpage": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e796f7572737570706f727470616765",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.transparency.yoursupportrequestsareheldbythesupportservicew": {
    resourceKey: "m6163636f756e742e7472616e73706172656e63792e796f7572737570706f7274726571756573747361726568656c646279746865737570706f72747365727669636577",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.andwerefundthewholemonthsleft": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e616e647765726566756e6474686577686f6c656d6f6e7468736c656674",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.back": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e6261636b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.confidentialprocessing": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e636f6e666964656e7469616c70726f63657373696e67",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.encryptedbackup": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e656e637279707465646261636b7570",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.ifyouwithdrawstopstodayandwerefundeverythingyo": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e6966796f75776974686472617773746f7073746f646179616e647765726566756e6465766572797468696e67796f",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "until", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.ifyouwithdrawstopstodayandwerefundeverythingyo2": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e6966796f75776974686472617773746f7073746f646179616e647765726566756e6465766572797468696e67796f32",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "until", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.privatenetwork": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e707269766174656e6574776f726b",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.signedinas2": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e7369676e6564696e617332",
    formatIntent: "text",
    arguments: [
      { name: "primaryEmail", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.subscriptioneveryboughton2": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e737562736372697074696f6e6576657279626f756768746f6e32",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "price", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "interval", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.subscriptiononthissignintowithdrawfrom": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e737562736372697074696f6e6f6e746869737369676e696e746f776974686472617766726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.the14daystowithdrawfromsrenewalonareoveryoucan": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e746865313464617973746f776974686472617766726f6d7372656e6577616c6f6e6172656f766572796f7563616e",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "refund", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.the14daystowithdrawfromthissubscriptionboughto": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e746865313464617973746f776974686472617766726f6d74686973737562736372697074696f6e626f756768746f",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.thereisnopaid": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e746865726569736e6f70616964",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.thereisnosubscriptionherewithdrawfrom": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e746865726569736e6f737562736372697074696f6e68657265776974686472617766726f6d",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.thissigninhasnoemailaddress": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e746869737369676e696e6861736e6f656d61696c61646472657373",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.tickstartmyservicenowcontinue": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e7469636b73746172746d79736572766963656e6f77636f6e74696e7565",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.wellsendtheacknowledgementto": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e77656c6c73656e6474686561636b6e6f776c656467656d656e74746f",
    formatIntent: "text",
    arguments: [
      { name: "primaryEmail", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.wereceivedyourwithdrawalhasstoppedandwontrenew": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e77657265636569766564796f75727769746864726177616c68617373746f70706564616e64776f6e7472656e6577",
    formatIntent: "text",
    arguments: [
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "refunding", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.wereceivedyourwithdrawalhasstoppedandwontrenew2": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e77657265636569766564796f75727769746864726177616c68617373746f70706564616e64776f6e7472656e657732",
    formatIntent: "text",
    arguments: [
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "refunding", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.wereceivedyourwithdrawalonandwerefinishingityo": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e77657265636569766564796f75727769746864726177616c6f6e616e647765726566696e697368696e676974796f",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.wereceivedyourwithdrawalonfinishingithitaprobl": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e77657265636569766564796f75727769746864726177616c6f6e66696e697368696e6769746869746170726f626c",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.wererefundingeverythingyoupaidforit": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e77657265726566756e64696e6765766572797468696e67796f7570616964666f726974",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawal.wererefundingeverythingyoupaidforitsrenewalon": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e77657265726566756e64696e6765766572797468696e67796f7570616964666f7269747372656e6577616c6f6e",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.withdrawfromyoursubscription2": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e776974686472617766726f6d796f7572737562736372697074696f6e32",
    formatIntent: "text",
    arguments: [
      { name: "service", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.youcanstillwithdrawfromthisrenewaluntiltheendo": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e796f7563616e7374696c6c776974686472617766726f6d7468697372656e6577616c756e74696c746865656e646f",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "price", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.youcanstillwithdrawhereforafullrefund": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e796f7563616e7374696c6c776974686472617768657265666f726166756c6c726566756e64",
    formatIntent: "text",
    arguments: [
      { name: "what", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.youcanstillwithdrawuntiltheendofthe14thdayafte": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e796f7563616e7374696c6c7769746864726177756e74696c746865656e646f667468653134746864617961667465",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "serviceName", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.youcanwithdrawuntiltheendofthe14thdayafterfora": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e796f7563616e7769746864726177756e74696c746865656e646f66746865313474686461796166746572666f7261",
    formatIntent: "text",
    arguments: [
      { name: "what", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.youcanwithdrawuntiltheendofthe14thdayafterthed": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e796f7563616e7769746864726177756e74696c746865656e646f6674686531347468646179616674657274686564",
    formatIntent: "text",
    arguments: [
      { name: "what", type: "string", min: null, max: null, numericStyle: "ungrouped" },
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.youhaveuntiltheendofthe14thdayafter": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e796f7568617665756e74696c746865656e646f66746865313474686461796166746572",
    formatIntent: "text",
    arguments: [
      { name: "date", type: "string", min: null, max: null, numericStyle: "ungrouped" },
    ],
  },
  "account.withdrawal.yoursubscriptiondetailsdidntloadso": {
    resourceKey: "m6163636f756e742e7769746864726177616c2e796f7572737562736372697074696f6e64657461696c736469646e746c6f6164736f",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.april": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e617072696c",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.august": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e617567757374",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.december": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e646563656d626572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.february": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e6665627275617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.january": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e6a616e75617279",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.july": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e6a756c79",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.june": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e6a756e65",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.march": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e6d61726368",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.may": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e6d6179",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.november": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e6e6f76656d626572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.october": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e6f63746f626572",
    formatIntent: "text",
    arguments: [
    ],
  },
  "account.withdrawalrules.september": {
    resourceKey: "m6163636f756e742e7769746864726177616c72756c65732e73657074656d626572",
    formatIntent: "text",
    arguments: [
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
