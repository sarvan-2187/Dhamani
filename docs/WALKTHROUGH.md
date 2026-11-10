<p align="center">
  <img src="readme/banner.svg" alt="Dhamani" width="100%">
</p>

# Walkthrough: every screen, from sign-up to certificate

The full Dhamani flow on real phones. Three people take part:

| Who | Role | Where |
|---|---|---|
| **Donor** | Signs up, gets an alert, donates | WhatsApp |
| **Friend** | Joins with the donor's invite link, donates too | WhatsApp, in Telugu |
| **Family** | Asks for blood and follows donors live | Website, sign-in on WhatsApp |

Screens come from a test run at a demo hospital ("DEV ONLY Test Hospital C"). The family's phone number is blurred.

**Jump to:** [1. Donor joins](#1-a-donor-joins-on-whatsapp) · [2. Friend joins](#2-a-friend-joins-with-the-invite-link) · [3. Family asks](#3-a-family-asks-for-blood) · [4. Alerts](#4-nearby-donors-get-an-alert) · [5. Donate](#5-donate-in-three-taps) · [6. Live page](#6-the-family-sees-who-is-coming) · [7. Certificate](#7-verified-with-a-certificate) · [8. Referral award](#8-the-referral-award) · [9. Console](#9-behind-the-scenes-coordinators-and-super-admin)

---

## 1. A donor joins on WhatsApp

**Donor's phone, WhatsApp.** The donor sends **JOIN** to the Dhamani number and answers a short chat. Most answers are a tap on a button.

<table>
  <tr>
    <td align="center" width="25%"><img src="flow/1-01-send-join.jpg" width="200"><br><sub>Send JOIN</sub></td>
    <td align="center" width="25%"><img src="flow/1-02-choose-language.jpg" width="200"><br><sub>Choose English, Tamil or Telugu</sub></td>
    <td align="center" width="25%"><img src="flow/1-03-privacy-note.jpg" width="200"><br><sub>Read what is stored, tap I agree</sub></td>
    <td align="center" width="25%"><img src="flow/1-04-name.jpg" width="200"><br><sub>Type a first name</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="flow/1-06-blood-group-asked.jpg" width="200"><br><sub>Pick the blood group from a list</sub></td>
    <td align="center"><img src="flow/1-07-date-of-birth.jpg" width="200"><br><sub>Date of birth (age 18 to 65)</sub></td>
    <td align="center"><img src="flow/1-08-sex.jpg" width="200"><br><sub>Sex</sub></td>
    <td align="center"><img src="flow/1-09-weight.jpg" width="200"><br><sub>Weight band</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="flow/1-10-location-pin.jpg" width="200"><br><sub>Share a location pin, kept to about 500 m</sub></td>
    <td align="center"><img src="flow/1-11-last-donation.jpg" width="200"><br><sub>Last donation date, or Never</sub></td>
    <td align="center"><img src="flow/1-12-radius.jpg" width="200"><br><sub>How far they can travel: 5, 10 or 20 km</sub></td>
    <td align="center"><img src="flow/1-13-night-alerts.jpg" width="200"><br><sub>Night alerts for emergencies</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="flow/1-14-registered.jpg" width="200"><br><sub>Registered, with the command list</sub></td>
    <td colspan="3" valign="middle">
      <b>Commands any time:</b> <code>STATUS</code> for their page and invite link, <code>PAUSE 30</code> to pause alerts, <code>UPDATE</code> to change details, <code>STOP</code> to delete the profile, <code>HELP</code> for the list.
    </td>
  </tr>
</table>

## 2. A friend joins with the invite link

**Friend's phone, WhatsApp.** The donor shares their personal invite link. It opens WhatsApp with JOIN and the donor's code ready, and the friend signs up the same way, here in Telugu.

<table>
  <tr>
    <td align="center" width="25%"><img src="flow/2-01-invite-forwarded.jpg" width="200"><br><sub>The donor forwards the invite</sub></td>
    <td align="center" width="25%"><img src="flow/2-02-join-with-code.jpg" width="200"><br><sub>JOIN with the invite code</sub></td>
    <td align="center" width="25%"><img src="flow/2-03-telugu-language.jpg" width="200"><br><sub>Telugu chosen</sub></td>
    <td align="center" width="25%"><img src="flow/2-04-telugu-privacy-note.jpg" width="200"><br><sub>Same questions, in Telugu</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="flow/2-05-telugu-registered.jpg" width="200"><br><sub>Registered</sub></td>
    <td align="center"><img src="flow/2-06-donor-page-joined.jpg" width="200"><br><sub><b>Donor's page:</b> "1 joined with your link"</sub></td>
    <td colspan="2" valign="middle">
      The donor's private page shows how many people joined with their link and how many went on to donate. Thanks are recognition only: no prizes or payments.
    </td>
  </tr>
</table>

## 3. A family asks for blood

**Family's phone, website.** Signing in takes one WhatsApp message: no password, no SMS. Then a single form.

<table>
  <tr>
    <td align="center" width="25%"><img src="flow/3-01-sign-in-code.jpg" width="200"><br><sub>A short sign-in code</sub></td>
    <td align="center" width="25%"><img src="flow/3-02-login-sent.jpg" width="200"><br><sub>Sent from their own WhatsApp</sub></td>
    <td align="center" width="25%"><img src="flow/3-03-signed-in-reply.jpg" width="200"><br><sub>WhatsApp confirms the sign-in</sub></td>
    <td align="center" width="25%"><img src="flow/3-04-hospital-search.jpg" width="200"><br><sub>Search a hospital or use location</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="flow/3-05-hospital-chosen.jpg" width="200"><br><sub>Nearby blood centres, with distance</sub></td>
    <td align="center"><img src="flow/3-06-patient-and-group.jpg" width="200"><br><sub>Patient first name and blood group</sub></td>
    <td align="center"><img src="flow/3-07-component-units.jpg" width="200"><br><sub>Component, units, needed by</sub></td>
    <td align="center"><img src="flow/3-08-needed-by.jpg" width="200"><br><sub>Pick the time</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="flow/3-09-post.jpg" width="200"><br><sub>Post the request</sub></td>
    <td align="center"><img src="flow/3-10-posted.jpg" width="200"><br><sub>"We have alerted 2 donors near the hospital"</sub></td>
    <td colspan="2" valign="middle">
      Requests that mention money are held for a coordinator. A family can have at most 2 open requests. A photo of the doctor's slip is optional and only coordinators can see it.
    </td>
  </tr>
</table>

## 4. Nearby donors get an alert

**Donor's and friend's phones, WhatsApp.** Only donors whose blood group is compatible, who are eligible to donate and who live near the hospital are alerted, a few at a time, each in their own language.

<table>
  <tr>
    <td align="center" width="50%"><img src="flow/4-01-donor-alert.jpg" width="260"><br><sub>Donor's alert in English: Donate, Not this time, Pause alerts</sub></td>
    <td align="center" width="50%"><img src="flow/4-02-friend-alert-telugu.jpg" width="260"><br><sub>Friend's alert in Telugu</sub></td>
  </tr>
</table>

## 5. Donate in three taps

**Donor's and friend's phones, WhatsApp.** Donate, a quick health check, an arrival time. Health answers are never stored, and the blood centre always does the final check.

<table>
  <tr>
    <td align="center" width="25%"><img src="flow/5-01-tap-donate.jpg" width="200"><br><sub>Tap Donate</sub></td>
    <td align="center" width="25%"><img src="flow/5-02-health-check.jpg" width="200"><br><sub>Quick health check</sub></td>
    <td align="center" width="25%"><img src="flow/5-03-arrival-time.jpg" width="200"><br><sub>Arrival time</sub></td>
    <td align="center" width="25%"><img src="flow/5-04-confirmed.jpg" width="200"><br><sub>Confirmed: address, directions, family's WhatsApp</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="flow/5-05-friend-health-check-telugu.jpg" width="200"><br><sub>Friend: health check in Telugu</sub></td>
    <td align="center"><img src="flow/5-06-friend-arrival-telugu.jpg" width="200"><br><sub>Friend: arrival time</sub></td>
    <td colspan="2" valign="middle">
      When enough donors have confirmed, the request closes by itself and everyone who confirmed is told. No more alerts go out.
    </td>
  </tr>
</table>

## 6. The family sees who is coming

**Family's phone, website.** The request page updates live. Donors appear by first name and arrival time only: their phone numbers are never shown.

<table>
  <tr>
    <td align="center" width="25%"><img src="flow/6-01-waiting-for-donors.jpg" width="200"><br><sub>Waiting for replies</sub></td>
    <td align="center" width="25%"><img src="flow/6-02-donor-on-the-way.jpg" width="200"><br><sub>A donor is on the way</sub></td>
    <td align="center" width="25%"><img src="flow/6-03-both-arrived-fulfilled.jpg" width="200"><br><sub>Mark each donor arrived</sub></td>
    <td align="center" width="25%"><img src="flow/6-04-fulfilled.jpg" width="200"><br><sub>Both arrived, request fulfilled</sub></td>
  </tr>
</table>

## 7. Verified, with a certificate

**Donor's and friend's phones, WhatsApp.** A few hours after the needed-by time, each donor is asked whether they donated. When the donor says yes **and** the family marked them arrived, the donation is verified: a Lifegiver badge and a PDF certificate arrive on WhatsApp.

<table>
  <tr>
    <td align="center" width="33%"><img src="flow/7-01-verified-badge-pdf.jpg" width="220"><br><sub>Verified, badge, certificate PDF</sub></td>
    <td align="center" width="33%"><img src="flow/7-02-certificate.jpg" width="220"><br><sub>The donor's certificate</sub></td>
    <td align="center" width="33%"><img src="flow/7-03-friend-certificate.jpg" width="220"><br><sub>The friend's certificate</sub></td>
  </tr>
</table>

The certificate shows the donor's name, the blood centre, the date and the request code. It never includes patient details.

## 8. The referral award

The donor in this walkthrough brought the friend, and the friend went on to donate. That makes the donor a referrer whose count can be recognised.

- **Their page:** "1 joined with your link. 1 of them have donated."
- **Console, Referrals:** the donor appears under their city with "1 donated, 1 joined". A referral counts only after a verified donation, never just a sign-up.
- **Ask first:** a coordinator taps **Ask to thank publicly**. The donor gets a WhatsApp question that says there is no prize or payment, and answers Yes or No.
- **The award:** with a yes, the top referrers in each city can receive a certificate, a memento or a public thank-you, for example on 1 October, National Voluntary Blood Donation Day.

<p align="center">
  <img src="console/06-referrals.jpg" alt="Console Referrals page" width="760"><br>
  <sub>Console, Referrals: top referrers per city, and the Ask to thank publicly button</sub>
</p>

Blood donation is voluntary and unpaid, so there is never cash, a voucher or a gift of value.

## 9. Behind the scenes: coordinators and super admin

**Laptop, console at `/console/login`.** While families and donors use WhatsApp and the website, coordinators keep requests honest and moving.

| Coordinators | Super admin, additionally |
|---|---|
| Queues: held requests (money mentioned), slips to review, escalated, reported or frozen, all open | System status: open requests, messages and failed sends today, last WhatsApp received |
| Request detail: slip photo, alert waves with each donor's reply, confirmed donors, activity log | Accounts: add, disable or enable, reset password, change role |
| Actions: release a hold, approve a slip, verify after a call, freeze, unfreeze, cancel | Hospital search |
| Message log by request code, numbers shown as the last 4 digits | Full audit log |
| Referrals: top referrers per city, ask to thank publicly | |

Nobody in the console sees a list of all donors or a donor's phone number, and every action is recorded.

### Coordinator screens

<table>
  <tr>
    <td align="center" width="50%"><img src="console/01-sign-in.jpg" alt="Coordinator sign in"><br><sub>Sign in: email and password, no public sign-up</sub></td>
    <td align="center" width="50%"><img src="console/02-queues.jpg" alt="Queues"><br><sub>Queues, with a count on every tab</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="console/03-request-detail.jpg" alt="Request detail"><br><sub>Request detail for DH-474J: status, facts, actions, slip</sub></td>
    <td align="center"><img src="console/04-waves-and-activity.jpg" alt="Waves and activity"><br><sub>Both donors confirmed and arrived, the alert wave, activity</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="console/05-message-log.jpg" alt="Message log"><br><sub>Every message for the request, numbers masked</sub></td>
    <td align="center"><img src="console/07-simulation.jpg" alt="Simulation"><br><sub>Simulation panel, for demos only</sub></td>
  </tr>
</table>

### Super admin screens

<table>
  <tr>
    <td align="center" width="33%"><img src="console/08-system-status.jpg" alt="System status"><br><sub>System status</sub></td>
    <td align="center" width="33%"><img src="console/09-accounts.jpg" alt="Accounts"><br><sub>Console accounts</sub></td>
    <td align="center" width="33%"><img src="console/10-audit-log.jpg" alt="Audit log"><br><sub>Audit log</sub></td>
  </tr>
</table>

---

<p align="center">
  <a href="https://dhamani-sigma.vercel.app"><b>dhamani-sigma.vercel.app</b></a><br>
  <sub>Free. No app to install. English, Tamil and Telugu.</sub>
</p>
