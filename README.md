# GameCompass 🧭

Spiele-Empfehlungen nach dem **Warum**, nicht nach dem Genre. Für dich und deine Freunde: Steam-Bibliothek, Wunschliste,
Steam-Familie und Spiele anderer Plattformen, KI-Geschmacksprofil, begründete Empfehlungen und ein Chatbot.

Alles läuft auf Free Tiers: **Vercel** (Hosting), **Supabase** (Postgres + pgvector), **Gemini** (KI), **Steam Web API**.

---

## Wie die Empfehlungen funktionieren (und warum besser)

Klassische Systeme vergleichen Tags oder schauen, was ähnliche Nutzer gekauft haben. Das Ergebnis ist „mehr vom Gleichen“
in derselben Thematik. GameCompass setzt drei Ebenen tiefer an:

1. **Spiel-Essenz.** Jedes Spiel wird einmal per KI aus Store-Text und echten positiven *und* negativen Steam-Reviews
   analysiert. Heraus kommen Erlebnis-Qualitäten wie Core Loop, Art des Fortschritts, Worldbuilding und wie es vermittelt
   wird, Stimmung, Reibung sowie 5–10 abstrakte Qualitäten (z. B. „Neugier als einziger Fortschritt“). Dazu kommen
   Kritikpunkte, polarisierende Elemente und „nicht für …“.
   Das Embedding wird **bewusst ohne Titel, Genre und Setting** gebildet. Deshalb landen Outer Wilds, Return of the Obra
   Dinn und Tunic nah beieinander, obwohl sie oberflächlich nichts gemeinsam haben.
2. **Geschmacksprofil in Facetten.** Aus Bewertungen, deinen Freitexten („was hat dich gepackt / gestört“), Spielzeit und
   Reaktionen auf frühere Empfehlungen leitet die KI Treiber, Aversionen (mit Schwere bis „No-Go“) und Spannungen ab.
   Außerdem entstehen **3–6 getrennte Such-Facetten**. Jede Facette wird einzeln gesucht und das Scoring nimmt das
   *Maximum* statt des Durchschnitts. Wer Koop-Chaos *und* melancholische Solo-Abenteuer liebt, bekommt also beides statt
   eines lauwarmen Mitteldings.
3. **Mehrere Kandidatenquellen und eine KI-Feinauswahl.** Die Kandidaten kommen aus der Vektorsuche im geteilten Katalog,
   aus hoch bewerteten Spielen von Freunden, aus „Querdenker“-Vorschlägen der KI (gegen den Steam-Store geprüft, damit nichts
   Erfundenes durchrutscht) und aus gut bewerteten Spielen passender Steam-Tags (inkl. Hidden Gems über
   den Wilson-Score). Danach gleicht die KI jeden Kandidaten gegen deine Aversionen ab. Ergebnis sind 10 Empfehlungen plus
   Wildcards, jeweils mit Begründung und ehrlichen Risiken.

**Lernt mit:** 👍/👎 auf Empfehlungen verschiebt die Such-Facetten des jeweiligen Modus sofort (Rocchio-Verfahren auf
zentrierten Vektoren – ohne KI-Aufruf). Im Profil lässt sich jeder Treiber und jede Abneigung mit ✓ bestätigen oder mit ✕
streichen; das gilt sofort und bleibt beim Neuberechnen erhalten. Starke Abneigungen (No-Gos) brauchen einen Beleg in den
eigenen negativen Angaben, sonst werden sie abgeschwächt. Kandidaten werden vor der teuren KI-Analyse über Tag-Paare,
Review-Zahl und No-Go-Tags vorgefiltert. Zu jeder Empfehlung zeigt GameCompass die ähnlichsten eigenen Spiele.

**Selbsttest** (Seite „Mein Geschmack“): Einige deiner Lieblingsspiele werden versteckt, das Profil wird ohne sie neu
gebaut, und dann wird gemessen, wie weit oben sie unter fremden Spielen landen. Verglichen wird mit Tag-Matching und reiner
Beliebtheit. So lässt sich „besser“ tatsächlich nachprüfen.

---

## Setup (ca. 20 Minuten)

### 1. Keys besorgen (alle kostenlos)

| Was | Wo |
|---|---|
| Steam Web API Key | https://steamcommunity.com/dev/apikey (als Domain deine spätere Vercel-Domain eintragen) |
| Gemini API Key | https://aistudio.google.com/apikey |
| Supabase-Projekt | https://supabase.com, dann ein neues Projekt anlegen (Free) |
| Deine SteamID64 | Steam-Profil → URL bzw. https://steamid.io |

### 2. Datenbank einrichten

Im Supabase-Dashboard unter **SQL Editor** den Inhalt von [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
ausführen. Alternativ mit der Supabase CLI: `supabase db push`.

Danach unter **Project Settings → API Keys** die *Project URL* und den *secret key* (`sb_secret_…`) kopieren.

### 3. Lokal starten

```bash
cp .env.example .env.local   # Werte eintragen
npm install
npm run dev
```

Dann http://localhost:3000 öffnen und mit Steam anmelden.

### 4. Online stellen (Vercel)

1. Code in ein **privates** GitHub-Repo pushen.
2. Auf https://vercel.com „Add New Project“ wählen und das Repo importieren.
3. Alle Variablen aus `.env.example` unter *Environment Variables* eintragen. `APP_URL` muss genau die Vercel-URL sein.
4. Deployen und dich als Erstes selbst anmelden. Über `ADMIN_STEAM_IDS` bist du automatisch Admin.
5. Freunde melden sich an und du schaltest sie unter **Admin** frei.

---

## Erste Schritte in der App

1. **Steam synchronisieren.** Dafür müssen in Steam unter Profil → Privatsphäre die *Spieldetails* öffentlich sein.
2. **KI-Analyse starten.** Die meistgespielten Spiele werden analysiert. Das Tempo ist ans Free Tier angepasst, der Tab
   muss offen bleiben.
3. **5+ Spiele bewerten**, vor allem die Freitexte ausfüllen. Das ist das wichtigste Signal.
4. **Empfehlungen generieren**, danach 👍/👎 mit Begründung geben. So lernt das Profil dazu.
5. Unter **Gruppen** eine Gruppe mit Freunden anlegen (optional als Steam-Familie) und den Einladungscode teilen.

---

## Hintergrund-Jobs (warum nichts im Browser laufen muss)

KI-Analyse, Profil-Berechnung und Empfehlungen laufen als **Server-Jobs** (Tabelle `jobs`, Code in
[`src/lib/jobs.ts`](src/lib/jobs.ts)). Kostenlose Vercel-Funktionen haben ein Zeitlimit, deshalb arbeitet ein Job in
**Etappen von ~45 s**: Jede Etappe holt sich eine exklusive Lease, speichert den Fortschritt und stößt über
`/api/jobs/tick` die nächste an (abgesichert per HMAC aus `SESSION_SECRET`). Reißt die Kette ab, nimmt der nächste
Seitenaufruf oder die nächste Fortschrittsabfrage den Job automatisch wieder auf. Der Browser fragt nur den
Fortschritt ab – Seite wechseln oder schließen ist egal. Nach einem Steam-Sync startet die Analyse automatisch.

## Sicherheit

- **Kein Passwort-Speicher.** Login läuft über Steam OpenID. Die Antwort wird serverseitig bei Steam verifiziert, `return_to`
  wird geprüft, und ein State-Cookie verhindert Login-CSRF.
- **Sessions** sind signierte JWTs (HS256) in einem `httpOnly`-, `SameSite=Lax`- und `Secure`-Cookie. Status und Rolle
  werden bei jedem Request frisch aus der DB gelesen, eine Sperre wirkt also sofort.
- **Freischaltung durch Admin.** Neue Accounts sind `pending`. Fremde können sich also nicht einloggen und dein
  Gemini-Kontingent verbrauchen.
- **Die Datenbank ist nur über den Server erreichbar.** RLS ist auf allen Tabellen aktiv, ohne Policies, und die
  DB-Funktionen sind für `anon`/`authenticated` gesperrt. Der Secret Key liegt nur in Server-Code (`server-only`).
- **CSRF**: Schreibende API-Routen prüfen zusätzlich den `Origin`-Header.
- **Eingaben** werden mit zod validiert. Ein **KI-Tageskontingent** pro Nutzer gilt (`AI_DAILY_LIMIT_PER_USER`).
- **Prompt-Injection.** Steam-Reviews und Nutzertexte werden als Daten markiert. Die KI-Ausgaben sind schema-validiertes
  JSON, und Chat-Tools können nur die eigenen Daten lesen bzw. das eigene Feedback schreiben.
- Security-Header wie `X-Frame-Options` und `nosniff` sind gesetzt.

**Datenschutz-Hinweis für Freunde:** Im Gemini Free Tier darf Google Ein- und Ausgaben zur Produktverbesserung nutzen.
Bewertungstexte und Chat-Nachrichten gehen an Google. Für Spielmeinungen ist das unkritisch, sollte aber jeder wissen.

---

## Grenzen und Ideen für später

- **Steam-Familie:** Valve bietet keine offizielle API dafür, die mit einem normalen Key funktioniert. Die App bildet die
  Familien-Bibliothek deshalb aus den Bibliotheken der Mitglieder einer „Steam-Familie“-Gruppe. Das klappt, solange alle
  mitmachen. Spiele ohne Family-Sharing-Freigabe können trotzdem auftauchen.
- **Andere Plattformen** werden manuell eingetragen. Ein CSV-Import für GOG, Epic oder PlayStation wäre der nächste Schritt.
- **Free-Tier-Limits:** Die Analyse ist gedrosselt. Je mehr Freunde mitmachen, desto größer wird der geteilte Katalog und
  desto besser die Vektorsuche.
- Modelle sind per ENV austauschbar (`GEMINI_MODEL`, …). Ein Wechsel des Embedding-Modells erfordert eine Neu-Analyse.

## Projektstruktur

```
supabase/migrations/   Schema, RLS, SQL-Funktionen (Sync, Vektorsuche, Familie, Kontingent)
src/lib/steam.ts       Steam Web API, Store, Reviews, SteamSpy, OpenID
src/lib/games.ts       Metadaten + KI-Essenz-Analyse + Warteschlange
src/lib/taste.ts       Geschmacksprofil + Such-Facetten
src/lib/recommend.ts   Kandidaten, Scoring, KI-Feinauswahl, Wunschlisten-Ranking
src/lib/chat.ts        Chatbot mit Tools (Bibliothek, neue Spiele, Lookup, Feedback)
src/lib/eval.ts        Hold-out-Selbsttest gegen Baselines
src/app/api/…          API-Routen (alle mit Session- und Origin-Prüfung)
src/app/(app)/…        Seiten: Übersicht, Empfehlungen, Chat, Bibliothek, Profil, Gruppen, Admin
```
