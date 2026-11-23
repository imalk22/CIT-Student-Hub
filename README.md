# CIT Student Hub

A front-desk tool for finding students, plus automatic admission cards with supervisor approval and email.

## Start it

```bash
cd student-hub
npm install
npm start
```

Then open http://localhost:5173. The first time, run `npm install` to set things up.

## What's inside

- **Lookup (home):** one search box for name, student no, index no, NIC, phone or email. Press `/` anywhere to search, use the arrow keys to move, and press Enter to open a student.
- **Profile:** shows a quick-answer line, contact details (tap to call, WhatsApp or copy), the level journey, a subject tile for each subject with the best mark, the exam history and the student's admission cards. **Copy reply** copies a ready-made summary to paste into WhatsApp or email.
- **Insights:** the dashboard.
- **Admissions:** every exam goes through four steps.
  1. **Import:** drop your admission Excel (Name in full, Student No, NIC, Email, Contact, Index Number, and a ×/Exempted column for each subject). The exam is created, the level is detected from the index numbers, and emails and phone numbers are saved to each student's profile.
  2. **Timetable:** enter the dates, times and venues.
  3. **Supervisor review:** the supervisor signs in by name, with an optional PIN, and each card is checked automatically (name, valid email, unique index, at least one paper applied, timetable complete). They approve cards one by one (key `A`) or approve all that pass every check, and can flag cards (`F`) or fix a wrong email on the spot. Changing a card after approval sends it back for review.
  4. **Email:** each approved student gets an email with their card attached as a PDF. The subject and message are editable and can include `{name}`, `{index}`, `{exam}` and `{timetable}`. Failed emails can be retried.
- **Members:** import the *Membership fee report* Excel (Fellow and Associate sheets, plus the payment log). It shows:
  - Collection for the current membership year (April–March) against what is expected, total outstanding, arrears and what is still due this year.
  - Collection for each year since 2017/18, and the latest payments.
  - A directory of fellows and associates with photos from citsl.lk, a coloured dot for each year, and filters for owing, this year unpaid, arrears, paid up, W/O, new and deceased.
  - For each member: what they owe and for which years, a year-by-year ledger with remarks, contact details, logged payments, and **Copy reminder** / **Email reminder** buttons.

  **Fee rates by year** (Members → Fee rates by year → Edit):
  - The official rates are Associate 5,000 / Fellow 6,000 for 2024/25, 6,000 / 9,000 for 2025/26, and 7,000 / 10,000 for 2026/27. Earlier years use what the fee report itself charges.
  - When a year's fee is blank in the sheet, the member is charged the rate for that year, unless they were W/O the year before, in which case the waiver carries over. This can be switched off.
  - Years where the sheet charged a different amount are flagged on the member's page.
  - Add next year's rate with **+ Add**.

  Years marked "W/O" are waived and never counted as owed, and the deceased section is left out. Fees are read from the sheet for each year (currently 10,000 for fellows and 7,000 for associates). Load the latest report with **Update Excel**. Lookup also searches members.
- **Members lookup:** the Members tab has its own search box at the top (press `/` while in Members). Student Lookup only searches students, and Members only searches members (Fellows and Associates).
- **Rules & fees** (book icon at the top): course structure, entry requirements, course and exemption fees, a calculator for instalment schedules with dates, exam fees (with the late fee), renewal and re-joining calculations, searchable exemptions, the 2014→2025 syllabus mapping, membership rules, and payment details. Everything comes from the CIT documents.
- **Import CIT documents** (Data tab): drop many files or a whole folder.
  - It recognises the Course Registration Masters, Student Renewal payments, Members' Details, the Membership Last Renewal year, the Fellow↔Associate list and the membership fee report.
  - Registrations add contacts, NIC, batch, learning mode and address to students, and students who haven't sat an exam yet become searchable.
  - Renewals give each student a "renewed up to" year and any overdue renewal fees (Rs 1,000/yr before 2023, Rs 2,000/yr from 2023). Students who completed the Advisory Level are exempt.
  - Insights shows renewal totals, and Students has "Renewal overdue" and "Registered only" filters.
- **Data:** import results Excel files, change email and supervisor settings, back up and restore.

## Sending real emails

Without settings, the app runs in **test mode**. Emails and PDFs are saved to `student-hub/outbox/` so you can check them, and nothing is sent.

## Microsoft 365 setup

The app sends through **Microsoft Graph** using an app registration, so no user password is stored. Microsoft has been switching off password-based SMTP in Exchange Online, which makes this the reliable route. A Microsoft 365 / Entra admin does steps 1–4 once.

**1. Pick the sending mailbox.** A shared mailbox such as `exams@yourdomain.lk` is ideal. Shared mailboxes need no licence, and sent cards are kept in that mailbox's Sent Items.

**2. Register the app** at [entra.microsoft.com](https://entra.microsoft.com) → *Identity → Applications → App registrations → New registration*.
- Name: `CIT Student Hub`. Account type: *this organizational directory only*. Leave the redirect URI empty.
- From the Overview page, copy the **Application (client) ID** and **Directory (tenant) ID**.

**3. Give it permission to send mail.**
- Go to *API permissions → Add a permission → Microsoft Graph → Application permissions → `Mail.Send`*, then click **Grant admin consent**.
- Go to *Certificates & secrets → New client secret* and copy the **Value** right away, because it is only shown once. Note the expiry date and renew the secret before then.

**4. Limit the app to the exams mailbox only.** This step is strongly recommended, because without it `Mail.Send` can send as *any* mailbox. In Exchange Online PowerShell:

```powershell
Connect-ExchangeOnline
New-DistributionGroup -Name "Student Hub Senders" -Type Security -Members exams@yourdomain.lk
New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId "Student Hub Senders" -AccessRight RestrictAccess -Description "Student Hub sends only as the exams mailbox"
Test-ApplicationAccessPolicy -Identity exams@yourdomain.lk -AppId <client-id>
```

The test command should say `Granted`. Testing it against any other mailbox should say `Denied`. The policy can take up to an hour to apply. For new setups, Microsoft also offers *RBAC for Applications* (`New-ManagementRoleAssignment -Role "Application Mail.Send"` with a management scope) as the newer way to do the same thing.

**5. Configure the app.** Copy `.env.example` to `.env` and fill in the values:

```
MS_TENANT_ID=<directory (tenant) id>
MS_CLIENT_ID=<application (client) id>
MS_CLIENT_SECRET=<secret value>
MS_SENDER=exams@yourdomain.lk
MAIL_FROM_NAME=CIT Examinations
```

Restart `npm start`. The terminal should show `Microsoft 365: signed in OK`. In the app, go to **Data → Email & approvals** and use **Check sign-in**, then **Send a test** to your own address before emailing students.

Keep `.env` private. It holds the secret and is excluded from git.

The server sends one email about every 2 seconds to stay under Exchange Online's limit of about 30 messages a minute, so 150 cards take about 5 minutes. If Microsoft throttles the app anyway, the server waits and retries automatically.

## Admission details check

Right after an admission Excel is imported, the app checks every candidate and opens a report. You can open it again any time from the coloured bar above the candidate list.

- **Must fix:** these block approval in supervisor review.
  - Missing name, a wrong or missing email, or a missing index number.
  - The same index number used twice.
  - No paper marked ×.
  - The same student appearing twice in the Excel. The last row is kept, and the report shows which row it replaced.
  - The same student number used twice.
  - An index number for a different level, for example `/AN1/` in an Application exam.
- **Double-check:** these show as warnings to the supervisor.
  - The name, NIC, email or phone is different from the student's profile.
  - The student number isn't found in the records.
  - The NIC or phone number doesn't look right.
  - The student applied for a paper they have already passed. It should be marked Exempted.
  - A paper is marked Exempted but there's no pass or exemption on record.
  - The student has already completed this level, or hasn't finished a lower level.
  - The index prefix is different from the other candidates'.
  - A student renewal is overdue.
  - The student has unpaid Xero invoices.

Each row shows **Excel vs Profile** side by side. **Export issues** downloads the full list.

## Member standing (suspended / terminated)

Membership years with a balance are counted up to and including the current year. W/O years and years with no charge are not counted.

- **2 or more unpaid years → Suspended.** Don't issue a membership slip or receipt until the arrears are cleared. The member's page shows an orange banner.
- **5 or more unpaid years → Terminated.** These members move out of "All active" onto their own page.

Open the standing page from the **Member standing** card on the Members tab, or use the Suspended and Terminated filters. Both lists can be exported. To change the thresholds, use **Rules** on the standing page.

## Xero setup (Finance page)

The **Finance** page (card icon at the top, or *Finance · Xero* in the sidebar) shows outstanding invoices from Xero, matched to students and members. Student dues have their own **Dues** tab (Student outstanding), kept separate from exam results — the student profile shows results only. Member pages get a *Finance · Xero* card. The app only **reads** from Xero and never changes anything there. Syncing works only through `npm start`, not on the Vercel website. The last synced copy stays in the browser.

**1. Create the Xero app** (once). Sign in at [developer.xero.com/app/manage](https://developer.xero.com/app/manage) with a login that can see the CIT organisation, then choose **New app**.
- Integration type: **Web app**. App name: `CIT Student Hub`. Company or application URL: the private Vercel site, `https://cit-student-hub.vercel.app`. Xero only shows this on the consent screen, and the app doesn't use it.
- Redirect URI: `http://localhost:5173/xero/callback`. If you changed `PORT`, use that port instead.
- Open **Configuration** and copy the **Client id**. Then **Generate a secret** and copy it, because it's only shown once.

**2. Add the keys to `.env`** and restart `npm start`:

```
XERO_CLIENT_ID=<client id>
XERO_CLIENT_SECRET=<client secret>
```

**3. Connect.** Open Finance and click **Connect to Xero**. Sign in, pick the CIT organisation and click **Allow access**. The app asks for read-only access to invoices and contacts (`accounting.invoices.read`, `accounting.contacts.read`). The connection is saved in `xero-tokens.json` on this computer, which is excluded from git and never served. It stays connected as long as you sync at least once every 60 days.

**Live updates.** Once connected, the app re-reads Xero by itself every 10 minutes. You can change this with `XERO_SYNC_MINUTES` in `.env` (minimum 2). Any open Finance, student or member page refreshes within about 2 minutes of each sync and shows a toast when the outstanding total changes. **Sync now** still updates straight away.

**How invoices are matched.** Only unpaid sales invoices (*Awaiting payment*) are read. Each one is matched to a person in this order:
1. A student number (`2024/A1/3236`) or index number in the contact's **account number**, the contact name, the invoice reference or the line description.
2. A membership number (`F 014`, `A-352`) in the account number, contact name or reference.
3. The contact's email.
4. The contact's name, if exactly one student or member has that name.

Anything left over appears under **Not matched**. To fix those, put the student or membership number in the Xero contact's **Account number** field and sync again.

> Older Xero apps may still use the broad scope `accounting.transactions.read` instead. In that case set `XERO_SCOPES=offline_access accounting.transactions.read accounting.contacts.read` in `.env`.

## Xero on the Vercel site (auto-updating, staff login)

The Vercel site (`https://cit-student-hub.vercel.app`) can connect to Xero itself, so Finance and Dues stay up to date without the office computer.

- **Staff login:** the whole site, including `data.json`, needs a staff password. People stay signed in for 30 days. Changing the password signs everyone out.
- **Live updates:**
  - While anyone has the site open, the Xero data is re-read once it's older than 10 minutes.
  - **Sync now** updates straight away.
  - A daily job keeps the Xero connection alive even when nobody opens the site.

**One-time setup** (in this order):

1. **Storage.** In Vercel, open the project → **Storage** → **Create / Browse Marketplace** → **Upstash for Redis** (free plan). Create it and **connect it to this project**. This keeps the Xero connection between visits.
2. **Environment variables.** Open Vercel → project → **Settings → Environment Variables** and add these for **Production**:

   | Name | Value |
   |---|---|
   | `HUB_PASSWORD` | the staff password (long, not used anywhere else) |
   | `XERO_CLIENT_ID` | from the Xero app |
   | `XERO_CLIENT_SECRET` | from the Xero app |
   | `XERO_REDIRECT_URI` | `https://cit-student-hub.vercel.app/xero/callback` |
   | `CRON_SECRET` | any long random text (protects the daily sync) |

3. **Xero app.** In the Xero app's **Configuration**, click **Add another URI** under redirect URIs and add `https://cit-student-hub.vercel.app/xero/callback`. Keep the `localhost` one too.
4. **Deploy.** Merge the branch into `main`, or click **Redeploy** in Vercel after adding the variables.
5. **Connect.** Open the site and sign in with the staff password. Go to **Finance → Connect to Xero** and click **Allow access**.

> Set `HUB_PASSWORD` **before** deploying. Without it the site shows "This site is locked" rather than being open to everyone.

To sign out, use **Sign out** on the Finance page. The office app (`npm start`) keeps working as before, with its own connection, and needs no password.

## Admission cards: download all and email (website and office app)

- **Download all:** in an exam, **Download all** makes one PDF per student and puts them in a single ZIP file. Each file is named by student number, so `2026/01/3035` becomes `2026-01-3035.pdf`. If a candidate has no student number, the index number is used instead. **One PDF** still puts every card in a single file.
- **Approve & email:** after importing the admission Excel and filling in the timetable, press **Approve N & email**. It's next to the check summary in the exam, and also in the check window.
  - It approves every card that passes all checks. Cards with problems stay in *To review*.
  - It then opens the email step. Nothing is sent until you press **Send**.
  - Each student gets their card attached, named by student number.
- **On the website**, PDFs are made in the browser, so no server is needed. To send emails from the website, add the same Microsoft 365 settings as the office app in Vercel → Settings → Environment Variables (Production), then redeploy:

  | Name | Value |
  |---|---|
  | `MS_TENANT_ID` | Directory (tenant) ID |
  | `MS_CLIENT_ID` | Application (client) ID |
  | `MS_CLIENT_SECRET` | client secret value |
  | `MS_SENDER` | the mailbox to send from, e.g. `exams@yourdomain.lk` |
  | `MAIL_FROM_NAME` | optional, e.g. `CIT Examinations` |

  Steps 1–4 of *Microsoft 365 setup* above explain how IT creates these. Then use **Data → Email & approvals → Check sign-in** and **Send a test**. The website sends one email about every 2 seconds, to stay within Microsoft's limit.

## Data that always shows (`data-files` folder)

The Excel files in `student-hub/data-files/` load automatically every time the app opens, in any browser on this computer: the membership fee report, members' details, last renewal year, the fellow↔associate list, the registration masters and the student renewals.

- **To update:** replace or add an Excel file in that folder (for example next month's membership fee report) and refresh the app. Only new or changed files are read.
- **Privacy:** the folder isn't a public web page. The server only gives these files to the app running on this computer, and the folder is excluded from git, so it isn't uploaded anywhere.
- **Requirement:** the app has to be started with `npm start`. Opening `index.html` directly can't read the folder.

## Notes

- PDFs are made with the Edge or Chrome already installed on the computer, so they match the printed card exactly.
- Data is kept in the browser's database (IndexedDB) on this computer. That gives you gigabytes of space instead of the old ~5 MB limit, and the Data tab shows how much is used. Data saved by the older version is moved across automatically the first time the app opens. Use **Data → Download backup** to move it to another computer.
- The supervisor PIN only stops casual approvals in this browser. It is not real security.
