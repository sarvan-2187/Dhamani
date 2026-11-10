# WhatsApp message templates

Generated from `messages/wa/*.json` by `npm run templates:md`. Do not edit by hand.

Submit each in WhatsApp Manager > Message templates > Create template:
Category **Utility**, the name below, and add all three languages (English `en`, Tamil `ta`, Telugu `te`).
Body text and buttons exactly as below. Buttons are **Quick reply** (the payload is set when sending).
No header, no footer, no links, no emoji.

## `request_alert`

| Variable | Meaning | Sample for review |
| --- | --- | --- |
| `{{1}}` | group | O+ |
| `{{2}}` | component | Whole blood |
| `{{3}}` | hospital | DEV ONLY Test Hospital A |
| `{{4}}` | area | Chennai |
| `{{5}}` | needed_by | 10 Nov, 6:00 pm |
| `{{6}}` | distance_km | 3 |
| `{{7}}` | request_code | DH-7Q4K |

Quick reply payloads, in order: `DONATE:<request_id>`, `NOT_NOW:<request_id>`, `PAUSE`

### English (en)

Body:

```
Blood needed near you: {{1}} {{2}} at {{3}}, {{4}}. Needed by {{5}}, about {{6}} km from you. Request {{7}}. Can you donate? The blood centre does the final health check.
```

Buttons: `Donate` | `Not this time` | `Pause alerts`

### Tamil (ta)

Body:

```
இரத்தம் தேவை: {{1}} {{2}}, இடம் {{3}}, {{4}}. {{5}}க்குள் தேவை, உங்களிடமிருந்து சுமார் {{6}} கி.மீ. கோரிக்கை {{7}}. நீங்கள் இரத்தம் கொடுக்க முடியுமா? இறுதி உடல்நலப் பரிசோதனையை இரத்த மையம் செய்யும்.
```

Buttons: `இரத்தம் கொடுப்பேன்` | `இம்முறை இல்லை` | `அறிவிப்புகளை நிறுத்து`

### Telugu (te)

Body:

```
రక్తం అవసరం: {{1}} {{2}}, స్థలం {{3}}, {{4}}. {{5}} లోపు అవసరం, మీ నుండి సుమారు {{6}} కి.మీ. అభ్యర్థన {{7}}. మీరు రక్తదానం చేయగలరా? చివరి ఆరోగ్య పరీక్షను రక్త కేంద్రం చేస్తుంది.
```

Buttons: `దానం చేస్తాను` | `ఈసారి కాదు` | `అలర్ట్‌లు ఆపండి`

## `request_followup`

| Variable | Meaning | Sample for review |
| --- | --- | --- |
| `{{1}}` | hospital | DEV ONLY Test Hospital A |
| `{{2}}` | request_code | DH-7Q4K |

Quick reply payloads, in order: `DONATED_YES:<request_id>`, `DONATED_NO:<request_id>`

### English (en)

Body:

```
Thank you for offering to help at {{1}} (request {{2}}). Were you able to donate?
```

Buttons: `Yes, I donated` | `No`

### Tamil (ta)

Body:

```
நன்றி. {{1}} இல் உதவ முன்வந்தீர்கள் (கோரிக்கை {{2}}). நீங்கள் இரத்தம் கொடுக்க முடிந்ததா?
```

Buttons: `ஆம், கொடுத்தேன்` | `இல்லை`

### Telugu (te)

Body:

```
ధన్యవాదాలు. మీరు {{1}} వద్ద సహాయానికి ముందుకొచ్చారు (అభ్యర్థన {{2}}). మీరు రక్తదానం చేయగలిగారా?
```

Buttons: `అవును, చేశాను` | `లేదు`

## `request_status`

| Variable | Meaning | Sample for review |
| --- | --- | --- |
| `{{1}}` | request_code | DH-7Q4K |
| `{{2}}` | confirmed_count | 2 |

Quick reply payloads, in order: `STILL_NEEDED:<request_id>`, `FULFILLED:<request_id>`, `CANCEL:<request_id>`

### English (en)

Body:

```
Your request {{1}} is still open, with {{2}} donors confirmed so far. Is blood still needed?
```

Buttons: `Still needed` | `Fulfilled` | `Cancel request`

### Tamil (ta)

Body:

```
உங்கள் கோரிக்கை {{1}} இன்னும் திறந்துள்ளது, இதுவரை {{2}} கொடையாளர்கள் உறுதி செய்துள்ளனர். இன்னும் இரத்தம் தேவையா?
```

Buttons: `இன்னும் தேவை` | `நிறைவேறியது` | `கோரிக்கையை ரத்து செய்`

### Telugu (te)

Body:

```
మీ అభ్యర్థన {{1}} ఇంకా తెరిచి ఉంది, ఇప్పటివరకు {{2}} దాతలు నిర్ధారించారు. ఇంకా రక్తం అవసరమా?
```

Buttons: `ఇంకా అవసరం` | `పూర్తయింది` | `అభ్యర్థన రద్దు`

## `eligible_again`

| Variable | Meaning | Sample for review |
| --- | --- | --- |
| `{{1}}` | date | 12 Nov 2026 |

Quick reply payloads, in order: `KEEP_ON`, `PAUSE_30`

### English (en)

Body:

```
Your donation interval ended on {{1}}. You can get alerts for nearby requests again. Keep alerts on?
```

Buttons: `Keep alerts on` | `Pause 30 days`

### Tamil (ta)

Body:

```
உங்கள் கொடை இடைவெளி {{1}} அன்று முடிந்தது. அருகிலுள்ள கோரிக்கைகளுக்கான அறிவிப்புகளை மீண்டும் பெறலாம். அறிவிப்புகளைத் தொடரவா?
```

Buttons: `தொடரவும்` | `30 நாள் நிறுத்து`

### Telugu (te)

Body:

```
మీ దాన విరామం {{1}} న ముగిసింది. దగ్గరలోని అభ్యర్థనల అలర్ట్‌లు మళ్లీ పొందవచ్చు. అలర్ట్‌లు కొనసాగించాలా?
```

Buttons: `కొనసాగించండి` | `30 రోజులు ఆపండి`
