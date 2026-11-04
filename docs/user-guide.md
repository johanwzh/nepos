# Nepos — brukerveiledning

Nepos er et verktøy for å lage rutetabeller for kollektivtrafikk og levere dem til Entur som NeTEx.
Det kjører i nettleseren (Chrome eller Edge på en datamaskin med Windows, Mac eller Linux) og jobber på en prosjektmappe på din egen
maskin. Ingenting sendes noe sted før du selv eksporterer og leverer filene.

> Denne veiledningen beskriver Nepos 2. Navn på knapper og menyer står i **fet skrift** slik de
> vises i programmet.

---

## 1. Kom i gang

### Prosjektmappen

Alt Nepos lagrer, ligger i én mappe du velger selv:

- `data/` — linjene (ERN-filer), kalendere, merkevarer og organisasjoner. Det er denne delen du
  deler med andre eller tar sikkerhetskopi av. Hver gang en linje lagres, legges den forrige versjonen i
  `data/backups/`; de 10 nyeste per linje beholdes. Det samme gjelder kalendere, organisasjoner,
  merkevarer, etiketter og kjøretøy: forrige versjon av filen ligger i `data/backups/` som
  `calendars.<tidspunkt>.json`, `orgs.…`, `brandings.…`, `labels.…` og `vehicles.…`, de 10 nyeste av hver. For å
  hente noe tilbake kopierer du filen tilbake til `data/` under det opprinnelige navnet (`calendars.json` osv.) mens Nepos er
  lukket. En slettet linje og kopiene fra formatoppgraderinger
  blir aldri ryddet bort. De rutede strekningene til hver linje ligger i `data/links/<linje>.json`.
- `private/` — dine egne innstillinger (språk, fargetema). Deles ikke.
- `exports/` — NeTEx-filene, én undermappe for hver eksport.
- `cache/` — kartdata Nepos har lastet ned for Ruting. Kan slettes når som helst; de lastes ned igjen ved behov.

### Nytt prosjekt eller åpne et som finnes

- **Prosjekt → Nytt prosjekt…**: gi prosjektet et navn og et *codespace* (tre store bokstaver, for
  eksempel `TST`; codespacet får du av Entur), og velg språk og lys/mørk. Velg så en tom mappe.
- **Prosjekt → Åpne prosjekt…**: velg prosjektmappen. Nylig brukte prosjekter står også i
  Prosjekt-menyen.
- Første gang en mappe åpnes, spør nettleseren om tilgang. Svar ja.
- Nepos må kunne åpne og lagre mapper på maskinen din, og det kan bare Chrome og Edge (og noen andre
  Chromium-nettlesere) på en datamaskin. I Firefox, Safari og i nettlesere på mobil og nettbrett sier Nepos fra på
  startskjermen at du må bruke en annen nettleser; **Nytt prosjekt…** og **Åpne prosjekt…** er da utilgjengelige.
- Uten et åpent prosjekt er alle fanene unntatt **Rediger rutetabell** (startskjermen) låst. De åpnes når et prosjekt åpnes.

Når et prosjekt åpnes, kjører Nepos en **prosjektkontroll**: den sier fra om filer som kan oppdateres,
som må rettes, eller som har feil filnavn — og tilbyr å rette det som kan rettes automatisk.

### Fanene

| Fane | Hurtigtast | Hva du gjør der |
|---|---|---|
| **Oppgaver** | Alt+1 | Det som trenger deg i dag: linjer som snart slutter å gå, linjer med feil, endringer som ikke er eksportert. Prosjektet åpner her. |
| **Rediger rutetabell** | Alt+2 | Linjens detaljer, tabellsett, kalendere og selve rutetabellen. Kartet ligger til venstre. |
| **Linjer** | Alt+3 | Alle linjene i én liste: finn, sorter, endre flere samtidig. |
| **Kalendere** | Alt+4 | Prosjektets kalendere (hvilke datoer noe kjører). |
| **Ressurser** | Alt+5 | Merkevarer og organisasjoner (autoriteter og operatører). |
| **Eksport** | Alt+6 | Kontroll og eksport til NeTEx. |
| **Analyse** | Alt+7 | Tallene i planen (**Statistikk**) og nettverket med turene i bevegelse (**Nettverkskart**). |

### Oppgaver

Når du åpner et prosjekt, kommer du til **Oppgaver**. Den sier med vanlige ord hva som trenger deg:

- **I dag** (store kort, hvert med én knapp): en linje som slutter å gå om under 30 dager (eller alt har sluttet), en
  linje med feil (feilene samlet etter type), og linjer som er endret siden forrige eksport.
- **Snart**: linjer som slutter å gå om 30–120 dager. Entur krever at dataene er gyldige i 120 dager når de leveres.
  Her står også linjer som ikke er eksportert på et halvt år, og linjer som bare har advarsler.
- En grønn linje når resten er i orden.
- **Gyldighet**: hver linje som eksporteres, frem til sin siste dag, med merker ved 30, 60, 90 og 120 dager.

Linjer som er satt til **Eksporteres ikke**, er ikke med. Nepos husker hver eksport (`data/exports.json`) fra denne
versjonen; før den første eksporten står linjene som «ingen eksport registrert».

### Analyse

**Analyse** har to faner, **Statistikk** og **Nettverkskart**, og du bytter fritt mellom dem.

#### Statistikk

**Statistikk** viser tallene i planen, satt opp som et regnskap eller en kvittering: rader som summerer seg, og hver sum
delt i sine deler. Det er ingen kontroll: mangler noe, havner det i en grå **Ukjent**-rad som er med i summen.

Til venstre er et tre: **Hele prosjektet**, oppdragsgiverne under det, og operatørene under hver oppdragsgiver (en
operatør som kjører for to oppdragsgivere, står under begge). En linje hører til den første oppdragsgiveren og den
første operatøren i linjedataene. Bare linjer som eksporteres, telles. Velg et nivå, og du får de samme blokkene:

- **Omfang** per transportmåte: linjer, turer, avganger (en tur på én dato) og stopp.
- **Rutet nett** per rutegruppe (vei, jernbane, sjø …): strekningene som er rutet, med km, og de som ikke er det.
  Hver strekning telles én gang.
- **Produksjon**: avganger, rutetimer og km, **planlagt**, **utført** (datoer før i dag) og **gjenstår**, og
  snittfarten. En tur har kjent km bare når alle strekningene er rutet; ellers telles den som «ukjent km».
- **Per drivstoff** (fra kjøretøyet på turen): avganger, km, timer og setekm.
- **Tilgjengelighet**: én stolpe for **lavgulv** (andel av kjent km: lavgulv, ikke lavgulv, og ukjent for turer uten
  kjøretøy) og én for **bestilling** (andel av avgangene som kan eller må bestilles).
- **Per dagtype**: hverdag, lørdag, søndag og helligdag, per dato.
- **Kjøretøy på veien samtidig**: hvor mange turer som er i gang hvert kvarter på en dato (den travleste først), med
  toppen merket. Det er det minste antallet kjøretøy planen trenger.
- **Produksjon gjennom perioden**: én stolpe per dato, avganger eller km.
- **Under …**: oppdragsgiverne, operatørene eller linjene under nivået du står på; klikk for å gå dit.

Øverst velger du **Alt planlagt** eller **Velg periode…** (fra–til). **Last ned som Excel** lagrer tallene i
`analyse/<tidspunkt> <navn>.xlsx` i prosjektmappa, ett ark per blokk; **Kopier som ren tekst** legger tallene på
utklippstavlen med kolonnene på linje.

#### Nettverkskart

**Nettverkskart** viser nettverket for nivået du har valgt under Statistikk: hver strekning én gang, langs veien der den
er rutet og tykkere der flere turer går, og hovedstoppene (uthevet i en rutetabell) som små prikker. På kartet kjører
turene: velg en dato (den travleste først) og flytt tiden med hjulet eller glidebryteren, 10 sekunder om gangen (hold
Shift på hjulet for ett minutt), eller trykk ▶: et planminutt per 0,6 sekund, eller ×5 og ×20 med fartsknappen. En
tur er en prikk i linjens farge som glir langs strekningen, med ring mens den venter på et stopp, og forsvinner ved siste stopp.
Her ser du hvor bussene klumper seg og hvor det er hull.

---

## 2. Linjene

### Listen

Fanen **Linjer** viser alle linjene. Til venstre er verktøykassen:

- **Finn** — søk, og filtrer på kalender, transportmåte, organisasjon og status.
- **Verktøy** — **+ Ny linje**, **Rediger**, **Dupliser**, **Slett**, og under *Endre valgte* kan du
  sette merkevare, organisasjoner og kalender for flere linjer samtidig.

**Offentlig** og **Eksporteres** er brytere på hver rad. De lagres med en gang — de er innstillinger for eksporten,
ikke endringer i linjen, så ulagrede endringer i rutetabellen forblir ulagrede (og får den nye verdien). Står raden
blant de valgte, settes alle de valgte linjene. En linje som ikke eksporteres, er skravert.

Under listen lagrer **Lagre alle i listen** og forkaster **Forkast endringer i listen** listens egne ulagrede endringer
— på Linjer bare linjene, på Kalendere bare kalenderne og på Ressurser bare ressursene.

Klikk for å velge, Shift- og Ctrl-klikk for å velge flere. Dobbeltklikk eller **Enter** åpner linjen.
Kolonneoverskriftene sorterer. Stripen til venstre på hver rad viser om linjen er gyldig nå (grønn),
starter senere (blå), snart utløper (oransje) eller er utløpt (grå). Tidslinjen under raden viser
alle dagene linjen kjører.

Listen husker søk, filter, sortering og valg så lenge du har Nepos åpent.

### Linjens detaljer

Øverst på **Rediger rutetabell**:

- **Linjenavnet** (høyreklikk: **Lag navn fra rutetabellen** — bruker stoppene med fet skrift).
  Lagrer du en linje uten navn, får feltet rød ramme.
- **Transportmåte** (ikonet), **linjenummer** og **privat kode**.
- **Merkevare**, **autoritet** og **operatør** til høyre. Organisasjonene hentes fra Entur sitt
  register (NOG). Finner du ikke organisasjonen, ta kontakt med kollektivdata@entur.org.
- **Legg til merknad…** — en tekst som følger hele linjen.

Linjeflaggene **Eksporteres / Eksporteres ikke** og **Åpen rute / Lukket rute** settes fra listen på **Linjer**. En lukket rute er merket **Lukket rute** i listen.

### Lagre

Endringer er ulagrede til du lagrer: **Ctrl+S** lagrer linjen du står i, **Ctrl+Shift+S** lagrer
alt (linjer, kalendere og ressurser). Du kan bytte mellom linjer uten å lagre — endringene følger
linjen til du lagrer eller forkaster dem (**Rediger → Forkast alle endringer**).

---

## 3. Rutetabellen

### Tabellsett og kalendere

En linje har ett eller flere **tabellsett** — fanene over rutetabellen, for eksempel «Bergen–Oslo»
og «Oslo–Bergen». **+** lager et nytt.

**Høyreklikk en fane** for **Ny… / Dupliser / Rediger… / Slett**. **Rediger…** (eller dobbeltklikk) gir navnet
og **retningen**: Tur, Retur, Med klokka eller Mot klokka (NeTEx DirectionType). Retningen er valgfri og
står i fanen, f.eks. «Oslo–Bergen [Retur]». **Dupliser** kopierer tabellsettet med alle turene.

Hvert tabellsett har én eller flere **kalendere** (raden *Kalendere* → **Velg…**). Tidslinjen under
viser hvilke dager tabellsettet kjører; står du i en kolonne, viser den hvilke dager akkurat den
turen kjører.

### Rader og kolonner

- **Rader** er stopp. **+** til venstre setter inn en rad; den nye radens stoppcelle blir valgt, så
  du kan søke opp stoppet med en gang.
- **Kolonner** er turer. Øverst står **dagkoden** (D = alle dager, 12345-type koder, DX67 = alle dager
  unntatt lørdag og søndag, H = helligdager …).
- Høyreklikk en dagkode → **Velg dager…** for å klikke dagene i stedet for å skrive koden.
- Høyreklikk en dagkode → **Vis turnummer** viser en rad for tur- eller tognummer.
- Høyreklikk en dagkode → **Vis etiketter** viser en rad for dine egne **etiketter** («Normal», «Rush»):
  velg cellen og trykk Enter (eller dobbeltklikk) for å velge en etikett i fargen sin, Delete fjerner,
  Ctrl+C / Ctrl+V kopierer mellom kolonner. Etikettene lager du under **Ressurser**; de er bare for deg og
  eksporteres ikke.
- Høyreklikk en dagkode → **Vis kjøretøy** viser en rad for hvilket **kjøretøy** som kjører turen. Den virker
  som etikett-raden: Enter eller dobbeltklikk velger, Delete fjerner, Ctrl+C / Ctrl+V kopierer. Kjøretøyene lager
  du under **Ressurser**. En tur som kopieres med intervall, får ikke med seg kjøretøyet.
- Dagkoder ryddes selv: DX76 blir DX67, 1234567 blir D. Ctrl+C / Ctrl+V kopierer dagkoder, også til og fra regneark
  (en rad eller kolonne med koder). Én kode limes inn i alle valgte kolonner. Flere koder limes inn i rekkefølge fra
  første valgte kolonne; er utvalget et helt antall ganger så bredt som det kopierte (to koder kopiert, fire kolonner
  valgt), gjentas kodene, ellers limes de inn én gang og nye kolonner legges til ved behov (over 50 spør Nepos først).
  Er noe i teksten ikke en dagkode, limes ingenting inn.
- **Flere kolonner:** Shift+klikk eller Shift+piltast i dagkode-raden velger flere kolonner. F7 (eller høyreklikk →
  merknad) gir alle samme merknad, og Ctrl+V limer en dagkode inn i alle. **×** på en av dem, **Delete** eller høyreklikk →
  **Slett de valgte kolonnene** sletter alle (Nepos spør én gang). Det samme med flere stopp: Shift+klikk eller Shift+piltast i stoppkolonnen, så **×**.
- **Merknadsraden** (prikkene og 📅 over dagkodene) kan velges: klikk en celle, Shift+klikk for flere, dobbeltklikk eller
  Enter for merknaden. Ctrl+C kopierer kolonnens merknad og datoer, Ctrl+V setter dem på de valgte kolonnene.
- Stoppkolonnen og radene øverst står fast når du blar, og cellen du står i holdes alltid synlig.
  Plattformkoden fra NSR (A, B, 2 …) står bak stoppnavnet. **Visning → Vis stoppenes privatkode** viser også
  NSR-privatkoden, i en grå brikke.

### Skrive tider

Velg en celle og skriv tiden (`0715` eller `715`), Enter. `|` betyr at turen passerer stoppet uten å
stoppe. Etter tiden kan du skrive `a` (bare avstigning) eller `p` (bare påstigning) — eller sette det fra
høyreklikkmenyen for alle valgte celler. **Stopper ved behov** og **bestilling** (x) skrives aldri: se under.

Ved en tid står opptil tre merker: a/p, x og én **bokstav** for tidens merknad og datoer (b, c, d … — a, p og x
hoppes over; samme merknad gir samme bokstav). Linjen under tabellen viser alt om tiden du står i, og under den
står bokstavene i tabellen, i rekkefølge (b, c, d …), hver med merknaden og datoene den står for. Bokstaven til tiden du
står i er merket. Bokstavene skrives aldri: de følger merknadene og datoene, og bare **a** og **p** skrives sammen med tiden.

**Etter midnatt:** en tid på en senere dag enn dagkoden har et lysegrønt felt i høyre kant av cellen — ingen `+1` i
cellen. Feltet er bredere for hver dag (+1, +2 …). Linjen under tabellen sier hvor mange dager etter dagkoden tiden
er. Fyll ut tider og + / − gir +1 av seg selv; ellers settes det med høyreklikk → Sett dagforskyvning….

Velg et område med **Shift + piltaster** eller ved å **dra med musen**. **Ctrl+C / Ctrl+V** kopierer
og limer inn tider, også fra og til regneark, og virker som i Excel:

- **Én celle til mange:** kopier én celle, velg flere celler og lim inn — alle de valgte cellene får den.
- **En blokk over et større utvalg:** er det valgte området et helt antall ganger så stort som blokken du kopierte
  (to rader kopiert, fire rader valgt), gjentas blokken over hele området. Passer ikke størrelsen, limes blokken inn
  én gang fra den øverste venstre cellen i utvalget.
- **Tabellen vokser:** limes en blokk inn én gang og rekker utenfor tabellen, legges kolonnene til til høyre og
  stoppradene nederst (blanke rader som du fyller ut). Over 50 spør Nepos først. Et valgt område gjør aldri tabellen
  større.
- Etter innliming er området som ble limt inn valgt. Kolonnene i et virtuelt intervall (de genererte turene) skrives
  aldri til, men teller med som plasser.
- Det samme gjelder **dagkodene**: kopier og lim inn i dagkode-raden, se over. Tider og dagkoder limes ikke inn samtidig.

**Lim inn en liste med stopp:** velg en stoppcelle og lim inn tekst med NSR Quay-ID-er — én per linje,
skilt med komma eller semikolon, eller rett fra et JSON-svar. Nepos tar ut alle `NSR:Quay:…` i rekkefølge
og fyller stoppene fra den valgte raden og nedover, som i Excel; rader legges til ved behov.

**Merknad på flere tider:** velg tidene og trykk F7 (eller høyreklikk → merknad).

**Kopiere:** Ctrl+C / Ctrl+V i Nepos tar med hele cellen — tid, a/p, x og bestilling, merknad og datoer.
**Ctrl+Shift+V** (lim inn utvalgt) lar deg velge hva som limes inn: tider, av-/påstigning, bestilling/forespørsel,
merknad og datoer. I merknadsraden: merknad, datoer, bestilling. Nepos husker valget.

**Problemer:** nede til venstre står «⚠ 2 feil · 1 advarsel» når linjen mangler noe. Klikk for å gå til
det første problemet — feltet merkes («Må fylles inn») — og klikk igjen for det neste.

### Verktøy på høyreklikk

På en tid:

- **≈ Interpoler tider** — fyller de tomme cellene mellom tidene du har skrevet, fordelt etter
  avstanden mellom stoppene. Står du i én celle, gjelder det hele kolonnen; har du valgt et område,
  bare mellom tidene i området. Skriv første og siste tid (eller tidene ved hovedstoppene), interpoler,
  og rett det som må rettes.
- **Kun avstigning / Kun påstigning / Ingen begrensning**, og **Stopper ved behov / bestilling…** (F8).
- (Tidsforskyveren er nå et kraftverktøy: se under.)
- **Merknad** (eller F7) og **Datoer for tiden…**.
- **Korrespondanse** (garantert eller bli sittende) til en annen tur. En garantert korrespondanse spør om **maks
  ventetid**: hvor lenge turen venter, opptil 1–60 minutter. **Venter opptil…** på høyreklikk endrer den, og linjen under
  tabellen viser den («Venter opptil 15 minutter»). En stiplet linje går fra tiden til målet, og målet er merket
  innerst i cellen (gult: garantert, turkis: bli sittende).

På en dagkode:

- **Kopier med intervall…** — for eksempel 08:00 hver time til 15:00. Dialogen sier hvor mange
  kolonner den lager. Kopier som starter etter midnatt får dagkoden flyttet en dag.
- **Sorter kolonnene** etter avgang, eller etter dagkode og så avgang.
- **Merknad** og **Datoer for turen…**.

### Bestilling og stopper ved behov

- **x på en tid** er *stopper ved behov* eller en *bestilling*. Velg tidene og trykk **F8** (eller høyreklikk →
  Stopper ved behov / bestilling…). Én dialog: **Ingen** (fjerner det som er der), **Stopper ved behov** eller **Bestilling**.
  Den åpner på det tiden har, så å rette en bestilling er F8, rett, Bruk. Ett valg gjelder alle valgte tider.
- **Bestillingen** fylles ut ovenfra og ned: **hvem kan bestille**, **hvordan** (minst én måte), **kontakt** (bare det
  måtene trenger: telefon for å ringe og SMS, nettadresse for nett), **frist** og en valgfri merknad. Fristen er **innen et
  klokkeslett** (når bestille og siste bestillingstid) eller **som minst … før avgang**; **som mest før** kan settes i tillegg, og må da være lengre enn som minst før.
  Tider som «1 d 4 t» settes med hjulet (Shift: timer) eller ved å klikke og skrive. Skjemaet sier fra om ett steg om
  gangen, og **Bruk** venter til bestillingen er i orden.
- **Hele turen:** velg turens dagkode (eller cellen i merknadsraden) og trykk F8, eller høyreklikk dagkoden →
  **Bestilling for turen…**. Turen får ☎ ved siden av 📅. En tur kan ha bestilling, men
  ikke «stopper ved behov».
- **Hele linjen:** ☎-knappen til høyre i linjens merknadslinje.
- Hvert nivå er komplett i seg selv; et nytt starter som en kopi av nivået over. En bestillingstur eller -linje gir
  ingen x på tidene.

### Kraftverktøy

Nederst i linjenavigatoren står **kraftverktøyene**. Å se dem endrer ingenting; slår du et verktøy på (klikk, eller
**Alt+J** / **Alt+I** / **Alt+L**), virker bare det verktøyet i tabellen — skriving, innliming og menyer er av, og resten av siden er dempet og låst (bare Lagre og Forkast virker). **Esc** slår det av. Med verktøyet av ser en blokk ut som vanlige kolonner, svakt skravert der du ikke kan skrive; med Virtuelle intervall på lyser alle blokkene opp.

- **Tidsforskyver** — et hjul (joggen) som flytter de valgte tidene ett minutt per hakk (Shift: ti): dra **ned** for senere, opp for tidligere (også hjulet og piltastene). Tallet (+8 min) gjelder de valgte tidene; velger du andre, toner det ut og starter på 0.
- **Virtuelle intervall** — dra en tur mot høyre for å gjenta den. Ett steg: en dialog der du skriver intervallet og
  siste avgang. To steg: hver time; tre: hver halvtime; så hvert 20., 15., 12. og 10. minutt. Drar du lenger, spør Nepos
  hvor ofte (hvert 6.–1. minutt). Tabellen viser første tur, én kolonne per minutt i timen og siste tur, for eksempel
  **06:05 | 35 05 | 08:05** for hver halvtime fra 06:05 til 08:05. Joggen i siste turs dagkode-celle flytter siste
  avgang med intervallet. Alt følger første tur: endrer du den, endres hele blokken. Blokken er låst og har en svak
  ramme; dra den tilbake til første tur for å fjerne den, eller **Pakk ut blokk** for å gjøre den til vanlige kolonner.
  Eksporten skriver alle turene. Intervaller som ikke går opp i en time (40 minutter), lager du med **Kopier med
  intervall**. En tur med korrespondanse kan ikke bli en blokk ennå.
- **Ruting** (alle linjer unntatt fly, **Alt+L**) — en egen visning i stedet for rutetabellen, der du ruter linjens
  mønstre langs nettet i OpenStreetMap: buss, ekspressbuss og taxi langs veiene (med bilferjene), tog langs jernbanen,
  trikk og T-bane langs sine spor, båt og ferje langs ferjerutene, og taubane, kabelbane og heis langs sine liner. Tog,
  trikk og taubane svinger aldri skarpt i et sporveksel. Et ferjekaistopp kan ligge et stykke fra ruten (opptil
  500 m; over 170 m merkes strekningen for sjekk). Finnes det ikke noe nett i nærheten, blir strekningen stående som
  rett linje. Øverst velger du tabellsett; nederst er ett lite bilde per mønster (hver unike rekke stopp),
  med ramme etter tilstand: **rød** — ikke rutet (et nytt mønster, eller et stopp uten NSR-posisjon), eller kjøretøyet er
  over en grense og ingen rute passer, **oransje** — må sjekkes (et stopp er flyttet i NSR, et annet stopp på en rad,
  eller strekninger som må bekreftes etter et bytte av kjøretøy, se under), **grønn** — rutet — og hvor
  mange turer som kjører mønsteret. Velg et mønster: alle radene i tabellen står til venstre, og stopp mønsteret
  passerer, har en **|** foran seg; kartet viser strekningene med stoppenes nummer og navn (de andre mønstrene svakt),
  og infofeltet til høyre viser mønsteret. **Forklaring** under infofeltet viser hva fargene og strekene betyr. Klikk en strekning på kartet eller mellom to stopp i listen for å se lengde,
  tid, veiene og hvor langt stoppene ligger fra veien. **Esc** går ett steg tilbake: strekning, mønster, ut.

  Du har kontrollen: ingenting rutes og ingen lagret avstand endres uten deg. **Finn rute** lager et forslag for
  mønsteret (eller den valgte strekningen); forslaget vises sammen med den gamle ruten (grå, stiplet), og infofeltet
  viser hvordan km og minutter endres. Klikk den valgte strekningen for å legge til et punkt ruten skal gå gjennom, dra
  punktet for å flytte det, høyreklikk eller **Delete** fjerner det. På en lang strekning kan du sette punktene før du
  trykker **Finn rute**; første gang i et nytt område viser infofeltet at kartdata hentes. **Godta** lagrer forslaget i
  `data/links/<linje>.json`. Nederst til høyre: **Forkast** dropper forslaget, **Bruk** godtar det, lagrer og lukker,
  og **Lukk** går ut. Et oransje
  mønster kan du **Behold**e som det er: ruten merkes som sjekket og blir grønn uten å endre en meter. Med
  **Automatisk ruting** på (Visning-menyen) får visningen **Oppdater alle**, som ruter og godtar alle røde og oransje
  mønstre i tabellsettet. Mens Ruting er åpen, er resten av Nepos låst; **Lukk** eller **Esc** går ut (Nepos spør først
  om et forslag ikke er godtatt).

  **Kjøretøy og grenser.** Høyde, bredde, lengde og vekt på kjøretøyene (se **Ressurser**) styrer ruten: en vei der
  OpenStreetMap har en grense kjøretøyet er over, brukes aldri. Høyde, bredde og lengde er harde grenser; opptil 5 %
  over en vektgrense er bare en advarsel. De samme stoppene kjørt av kjøretøy i ulike størrelser rutes hver for seg: hver
  **kjøretøygruppe** får sitt eget lille bilde, med kjøretøyene ved siden av mønsteret. Turer uten kjøretøy, eller med et
  kjøretøy uten mål, rutes som før.
  - **Hvorfor ruten går rundt:** der grensene sender ruten en omvei, tegnes ruten uten grenser i rødt (**Rute uten
    grenser (stengt)** i **Forklaring**), og infofeltet sier hvorfor, for eksempel «Går rundt: TB (4,0 m) er høyere enn
    fri høyde 3,7 m på Matrandvegen – +1,4 km, +2 min», med lenken **OpenStreetMap ↗** til veien, så en feil merking kan
    sjekkes og rettes der. Kommer ikke kjøretøyet fram til et stopp, står det «Ingen rute for dette kjøretøyet». Infofeltet
    viser også **Laveste grenser** langs strekningen.
  - **U-svinger:** et kjøretøy kan snu ved et stopp, et punkt ruten skal gjennom, eller i et kryss på en liten vei
    (residential, unclassified eller service i OpenStreetMap, høyst 50 km/t), og jo lengre kjøretøyet er, jo mer koster
    det: en minibuss snur ved stoppet sitt der en 12 m lang buss kjører videre for å snu. På større og raskere veier blir
    det ingen U-svinger. Ruting merker hver U-sving på kartet (**U-sving** i Forklaring).
  - **Godta** lagrer ruten som den vanlige strekningen, eller som kjøretøygruppens egen variant når den er en annen.
    Står det «Deles med …» i infofeltet, bruker en annen gruppe den samme ruten. **Behold** virker også for én gruppe.
  - **Sjekk av lagrede ruter:** når Ruting åpnes, sjekker Nepos selv de lagrede rutene mot grensene (ruter lagret med en eldre
    versjon av Nepos får grensene fylt ut første gang), og en rute merkes bare når en grense betyr noe for kjøretøyet.
    Nyere kartdata alene merker ingen ruter. Byttes et kjøretøy, kan strekninger bli oransje: **Kan være kortere for dette
    kjøretøyet** (**Behold** eller **Finn rute**) eller **Ikke sjekket mot kjøretøyets mål ennå** (**Finn rute**).

  Kartdataene lastes ned første gang du ruter og ligger så i prosjektets `cache/`, så du kan rute uten nett der du har
  rutet før. En strekning ingen tur bruker lenger (du har byttet et stopp i rutetabellen), eksporteres ikke, men den
  beholdes til du selv fjerner den: retter du en skrivefeil i rutetabellen, er den samme ruten gyldig igjen. Uten noe
  mønster valgt viser Ruting hvor mange ubrukte strekninger som er beholdt, og **Fjern ubrukte** fjerner dem (Nepos
  spør først). **Linjer** viser hvor mange mønstre som er rutet, og eksportkontrollen varsler om strekninger
  som mangler. Kartdata © OpenStreetMap-bidragsytere.
<!-- Knutepunkt: skjult i 2.6 til Antu støtter korrespondanser (bruker 2026-11-01)
- **Knutepunkt** (**Alt+K**) — korrespondanser mellom linjer: turene på denne linjen venter på et stopp på en tur fra en
  annen linje i prosjektet (materen). Vi lover bare for vår egen linje: vår tur venter, aldri den andre. Knutepunkt er en
  egen visning i stedet for rutetabellen, som Ruting. Til venstre står alle stoppene i tabellsettet med en bryter; slå
  på stoppet der turene skal vente (et stopp med ankomst- og avgangsrad står én gang). Til høyre velger du **hva vi
  venter på**: stoppene for overgangen (stoppestedet selv, andre stoppesteder, eller alle innen en radius), **vinduet**
  (hvor mange minutter før vår avgang materen kan komme), **maks ventetid** (hvor lenge vår tur kan holdes igjen) og
  **gange** (minste overgangstid), og hva materen må være: oppdragsgiver, operatør, transportmåte, linjenummer, og
  stopp den har vært innom før.

  I midten er **tidslinjen** ved stoppet: våre avganger øverst (klikk for å velge turene som skal vente, eller **Alle**),
  maternes ankomster under, én rad per linje, og vinduet skravert før hver valgt avgang. Hjulet zoomer, dra flytter,
  dobbeltklikk viser alt. Under står **Forslag**, én rad per valgt tur: **ny**, **uendret**, **endret** (materen kommer
  til en annen tid), **borte** (ingen mater passer lenger), **velg én** (flere passer: velg en) eller **ingen treff**.
  **Godkjenn** lagrer koblingene i linjen, **Forkast** dropper valgene, **Finn treff** leter på nytt. Bare godkjente
  koblinger eksporteres, som garanterte korrespondanser. En tur med en godkjent kobling har en liten ⇄ i rutetabellen.
  Eksportkontrollen varsler når en kobling er endret, når materens linje ikke eksporteres, eller når stoppet på raden er
  byttet. Foreløpig bare mellom linjer i samme prosjekt; korrespondanser til andre kodeområder kommer senere.
-->

### Visuell rutetabell (Alt+V)

**Alt+V** viser tabellen du står i som et diagram (Marey-diagram) i stedet for rutetabellen: radene nedover (etter avstand
mellom stoppene, eller jevnt), klokken bortover, og hver tur som en linje gjennom tidene sine. Bratt er raskt, flatt er
venting. Et stopp turen passerer, har ingen markør: linjen går stiplet rett til neste stopp; turer med samme mønster deler et farget bånd, så de som
skiller seg ut, synes. Velg dag, uke eller måned, fremhev ukedager, og klikk en tur for å fremheve den. Rull for å zoome,
dra for å flytte, dobbeltklikk en tur for å zoome til den. **Alt+V** igjen går tilbake.

### Merknader og datoer

- En **merknad** er en tekst på en tur eller en enkelt tid. Ctrl+Enter bruker den.
- **Datoer** er unntak fra kalenderen for en tur: velg **+ Kjører også** eller **− Kjører ikke** og
  klikk eller dra over dagene. Datoer på en tur eksporteres. Datoer på en enkelt tid lagres, men
  eksporteres ikke ennå (eksportkontrollen sier fra).

### Destinasjoner

En **destinasjon** er det reisesøket viser at turen går til («Linje 71 mot Røros»). Alle turer må ha
en før eksport.

- **Alt+D** eller knappen **Destinasjoner** til høyre over tabellen viser og skjuler en smal kolonne
  etter hver tur. Destinasjonen står med liten skrift der den begynner, og en strek i samme farge
  går ned til den neste. Grønn, blå og rød går på rundgang. Dobbel strek betyr at destinasjonen har via.
- **Skriv** i destinasjonscellen på turens første stopp. På et senere stopp skifter destinasjonen der.
  Enter eller dobbeltklikk åpner den, og der legger du til **via** (aldri skriv «via» i teksten).
  Nepos foreslår destinasjoner du har brukt før.
- **Dra** en endring til et annet stopp. **Shift+dra** destinasjonen ned til et stopp: stoppet blir
  via, og fra stoppet av går turen uten den.
- **Høyreklikk → Foreslå destinasjoner** lager et forslag fra stoppene: siste stopp er destinasjonen,
  **fete** stopp blir via, og et **understreket** stopp blir en egen destinasjon før turen går videre.
  Marker flere kolonner for å foreslå for alle.
- **Ctrl+C / Ctrl+V** kopierer destinasjonene fra én kolonne til andre. **Delete** fjerner.
  **Ctrl+Z** angrer siste destinasjonsendring.
- Eksportkontrollen sier fra om turer uten destinasjon og om destinasjoner som ikke ser ut til å passe
  med stoppene turen kjører til.

### Fartsprofilen

Stripen under rutetabellen viser farten mellom stoppene for turen du står i. En rutet strekning måles
langs ruten, resten i luftlinje (statuslinjen sier hvilken når du holder over en bue). Fargen regnes alltid
i luftlinje, som fartsgrensene i prosjektinnstillingene: rødt betyr at selv luftlinjen er for rask for
transportmåten — da er en tid eller et stopp feil. Klikk en bue for å gå til raden.

- Den vannrette streken er **turens egen snittfart** (`⌀ 42 km/t`): buer over den går raskere enn turen ellers,
  buer under går saktere.
- Rundt hver bue ligger et svakt felt: farten kan ligge hvor som helst der, fordi tider skrives i hele minutter
  (sekunder skrives aldri). Turens første avgang og en avgang etter venting regnes fra :00; andre tider kan være
  hvor som helst i minuttet. Korte strekninger får derfor brede felt.
- Hold musen over en bue: farten står over buen (bare tallet), og statuslinjen nederst viser fra–til, avstand,
  minutter og fartsspennet.

En rød strekning stopper eksporten. Grensene per transportmiddel kan endres i **Prosjekt →
Prosjektinnstillinger → Fartsgrenser** (tomt felt = standard). Settes en grense mer enn 1,5 ganger over
standard, får eksporten en advarsel om at Entur kanskje ikke godtar så raske turer.

### Store linjer

Nepos kontrollerer linjen mens du arbeider: hver tur ved hvert stopp. Det en linje veier, er derfor **turer × stopp**,
antall passeringer. Dagene teller ikke: en linje som går hver dag i to år, er ikke tyngre enn en som går én uke. En
blokk (**Virtuelle intervall**) lager alle turene sine selv om tabellen viser den som noen få kolonner: hvert minutt fra
06:00 til 04:00 er 1 321 turer.

Målt i Chrome (november 2026):

| Linje | Turer | Passeringer | Kontrollen tar |
|---|---|---|---|
| Bylinje hvert 10. minutt, 8 stopp, to retninger | 300 | 2 400 | 0,02 s |
| Tog hvert minutt fra 06:00 til 04:00, 28 stopp | 1 322 | 38 000 | 0,1 s |
| Stamlinje hvert 5. minutt, 44 stopp, to retninger | 922 | 40 600 | 0,2 s |
| Hvert minutt hele døgnet, alle dager, 44 stopp, to retninger | 8 640 | 380 000 | 2,5 s |

- Fra **20 000 passeringer** kontrolleres linjen når du stopper å skrive, ikke for hvert tastetrykk: merket for
  problemer nederst viser det forrige resultatet et øyeblikk. Klikker du merket, kontrolleres linjen med en gang.
- Fra **150 000 passeringer** står det **Stor linje** nederst, med antall turer og passeringer. Da tar kontrollen
  rundt et sekund eller mer etter hver endring. Nepos virker, men tregere.

Råd:

- La en blokk være så tett og så lang som tilbudet faktisk er.
- Del en linje i flere linjer bare der det virkelig er forskjellige tilbud.
- Å dele turene på flere tabeller (for eksempel helgeturene i en egen tabell) gjør ikke linjen lettere: Nepos
  kontrollerer hele linjen, og en blokk viser seg som noen få kolonner uansett hvor mange turer den lager.
- En tabell med mange kolonner tegnes om for hvert tastetrykk. Der teller tabellens størrelse på skjermen, ikke antall
  turer: en blokk hvert 10. minutt viser én kolonne per avgang i timen, en blokk hvert 5. minutt bare én.

---

## 4. Stopp og kart

Kartet åpnes av seg selv når du står i stoppkolonnen, og skjules når du går ut av den. Vil du ha det åpent hele
tiden, klikker du **nålen** øverst i kartet — eller trykker **Alt+M**, som åpner og fester det (Alt+M igjen løsner og
skjuler det). ✕ lukker og løsner.

- Øverst vises stoppet på raden du står i: navn, plattform, hva NSR vet om det (leskur, skilt,
  rullestol — med symboler), ID-en med **Kopier**, en lenke til NSR og en til **StreetView** på stoppets plass.
- Står du i en stoppcelle og **skriver**, åpnes et lite søkevindu rett ved cellen. Treffene er et tre: hvert
  stoppested med plattformene sine under. Du velger alltid en plattform, aldri bare stoppestedet: piltastene går
  mellom plattformene, **Enter** (eller et klikk) setter den på raden, og cellen blinker. **Esc** lukker uten å
  velge. En Quay- eller StopPlace-ID kan limes inn i søket. **Enter** eller **F2** på et stopp åpner søket med
  stoppets navn, så du kan bytte stopp eller plattform; navnet på et stopp skrives aldri fritt.
- På kartet vises plattformene som nåler (spissen er plattformens plass) når du zoomer inn. Står du i en
  stoppcelle, setter et **klikk** på en plattform den på raden med en gang. **Shift+klikk** legger den til på en ny
  rad under; høyreklikk gir også **Legg til over**. Plattformen du står på i søkevinduet (piltaster eller musen),
  er markert på kartet. En plattform uten kode har en prikk i listen. Et klikk på kartet lukker
  søkevinduet — søk i listen, og velg på kartet.
- **Registrer stopp** er et kraftverktøy (Spesialverktøy, **Alt+R**): klikk plattformene langs ruten i rekkefølge
  — hver legges i neste tomme rad eller nederst. **Ctrl+Z** angrer det siste, **Esc** avslutter. Kartet kan brukes
  mens verktøyet er på. **Optimalisering** ved siden av er ikke i bruk ennå.
- **Ctrl+C / Ctrl+V på et stoppnavn** kopierer stoppet til en annen rad. Velg flere stopp (Shift+klikk eller
  Shift+piltaster), så kopierer Ctrl+C alle Quay-ID-ene som en liste; limes listen inn, fylles radene nedover og nye
  rader legges til ved behov.
- **Tøm stopp** fjerner stoppet fra raden (navnet blir stående).

Nepos tilbyr bare stopp med samme transportmåte som linjen. En linje for snø og is kan også bruke veistopp (buss,
langdistansebuss), men en buss- eller langdistansebusslinje kan ikke bruke stopp for snø og is.

**Kartlag:** øverst til høyre på kartet velger du **Kart** (OpenFreeMap, som før), **OpenStreetMap** (mørknet i
mørk modus) eller **Flyfoto** (Esri). Valget huskes for deg. Har prosjektinnstillingene en egen kartstil, vises ikke
valget.

### Strekninger på kartet

Kartet bruker OpenFreeMap (lyst eller mørkt etter Nepos' utseende), eller kartlaget du har valgt. Strekningene har
samme farger som i Ruting: grønn langs den rutede veien (eller sporet, sjøen, linen), oransje der et stopp er flyttet
siden den ble rutet, og rød stiplet rett linje der den ikke er rutet; et stopp på en strekning uten rute er en rød
prikk. Fly tegnes som rette linjer mellom stoppene. Når du velger stopp, viser kartet stoppene i nærheten først når du har zoomet
nok inn; en merknad øverst på kartet sier fra. Rutene lages i **Ruting** (kraftverktøyene); eksporten skriver dem som
ServiceLinks for hvert mønster der alle strekningene er rutet.

---

## 5. Kalendere og ressurser

### Kalendere

På **Kalendere** ligger prosjektets kalendere i en liste; **Rediger** åpner en. Klikk eller dra over
dagene for å slå dem av og på. **Fjern / Velg alle helligdager** gjelder månedene som vises. Endringer
lagres med **Lagre**. Listen viser hvilke linjer som bruker kalenderen — klikk for å åpne linjen.

### Ressurser

**Merkevarer** og **organisasjoner** i én liste. Merkevarer lager og endrer du selv. Organisasjoner
kommer fra Entur sitt register; det eneste du kan endre, er eksport-ID-en (bare den siste delen etter
`ABC:Authority:`). Registerets status og Entur-adressene står i **Prosjekt → Prosjektinnstillinger**.

**Etiketter** (+ Ny etikett) er dine egne merkelapper for turer, med navn og farge. De brukes i
etikett-raden i rutetabellen.

**Kjøretøy** (+ Nytt kjøretøy) er prosjektets egne kjøretøy, til kjøretøy-raden i rutetabellen. Et kjøretøy har
navn, kortkode (vises i rutetabellen i stedet for navnet), transportform, drivstoff, lavgulv, sitteplasser, lengde,
bredde og høyde i meter, **vekt** i tonn (tillatt totalvekt), en kjøretøytype-ID som Nepos lager, og en VehicleTypeRef
(du skriver delen etter `NMR:VehicleType:`). Fargen er bare fargen på merkelappen i rutetabellen, ikke kjøretøyets farge.
De eksporteres ikke ennå; senere skal et kjøretøy her vise til Entur sitt kjøretøyregister.

Transportformen avgjør hvilke linjer kjøretøyet kan kjøre, og rutetabellen viser bare kjøretøy som passer. Buss,
langdistansebuss og taxi hører sammen, og det gjør båt og ferge også. Et kjøretøy for snø og is (en beltebil) kan kjøre
alle veilinjer, men et veikjøretøy kan ikke kjøre en linje for snø og is. Alle andre transportformer må være like. Et
kjøretøy uten transportform passer på alle linjer. Et kjøretøy lagret som «Ferge» blir «Båt» neste gang kjøretøylisten
lagres.

Høyde, bredde, lengde og vekt styrer **Ruting** og eksportkontrollen (se Ruting og Eksport); lengden avgjør også hva en
U-sving koster. Kjøretøy uten mål ruter som før.

---

## 6. Eksport

På **Eksport** kontrollerer Nepos hele prosjektet først. **Feil** må rettes før eksport; **advarsler**
er ting du bør se på. **Eksporter NeTEx** skriver filene til `exports/` (som ZIP hvis du vil). Linjer
merket **Eksporteres ikke** kommer ikke med. Etter eksporten står det hvor den ligger, fra prosjektmappen
(prosjektmappen\exports\tidspunkt).

**Levering til Entur:** last opp de eksporterte filene på siden Rutetabeller på https://entur-partner.entur.org/.
Codespace i prosjektet må være nøyaktig det samme som codespacet Entur har gitt deg tilgang til. Mer under
**Hjelp → Levering til Entur**.

Problemene er samlet etter type: samme feil på mange turer i en linje står på én linje med antallet (for eksempel
«×20»). Klikk for å se hver av dem.

**Kjøretøy og grenser:** kontrollen sjekker hver tur mot grensene langs ruten kjøretøyet får (se **Ruting**). En tur der
kjøretøyet er over en grense, er en **feil** («… er høyere enn fri høyde …: bytt kjøretøy eller ruter på nytt»). Under
0,5 m å gå på (høyde, bredde, lengde), eller en vekt nær grensen, er en **advarsel**. Strekninger som må bekreftes etter
et bytte av kjøretøy, eller som ikke er sjekket mot kjøretøyets mål ennå, gir én advarsel per linje («… åpne Ruting på
linjen»). Der Nepos kan se at et byttet kjøretøy fortsatt får samme rute, spør den ikke. Eksporten skriver hver tur på
ruten til kjøretøygruppen sin; kjører to grupper med de samme stoppene ulike veier, får de hvert sitt JourneyPattern
(Antu melder det bare som informasjon).

Hver tur blir en NeTEx ServiceJourney med én DatedServiceJourney for hver dag den kjører (kalender +
dagkode + turens egne datoer). Tognummer eksporteres som TrainNumber, andre turnummer som PrivateCode.


---

## 7. Hurtigtaster

Hele listen står i **Hjelp → Hurtigtaster**.
