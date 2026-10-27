# Nepos — brukerveiledning

Nepos er et verktøy for å lage rutetabeller for kollektivtrafikk og levere dem til Entur som NeTEx.
Det kjører i nettleseren (Chrome eller Edge på PC/Mac) og jobber på en prosjektmappe på din egen
maskin. Ingenting sendes noe sted før du selv eksporterer og leverer filene.

> Denne veiledningen beskriver Nepos 2. Navn på knapper og menyer står i **fet skrift** slik de
> vises i programmet.

---

## 1. Kom i gang

### Prosjektmappen

Alt Nepos lagrer, ligger i én mappe du velger selv:

- `data/` — linjene (ERN-filer), kalendere, merkevarer og organisasjoner. Det er denne delen du
  deler med andre eller tar sikkerhetskopi av. Hver gang en linje lagres, legges den forrige versjonen i
  `data/backups/`; de 10 nyeste per linje beholdes. En slettet linje og kopiene fra formatoppgraderinger
  blir aldri ryddet bort.
- `private/` — dine egne innstillinger (språk, fargetema). Deles ikke.
- `exports/` — NeTEx-filene, én undermappe for hver eksport.

### Nytt prosjekt eller åpne et som finnes

- **Prosjekt → Nytt prosjekt…**: gi prosjektet et navn og et *codespace* (tre store bokstaver, for
  eksempel `TST`; codespacet får du av Entur), og velg språk og lys/mørk. Velg så en tom mappe.
- **Prosjekt → Åpne prosjekt…**: velg prosjektmappen. Nylig brukte prosjekter står også i
  Prosjekt-menyen.
- Første gang en mappe åpnes, spør nettleseren om tilgang. Svar ja.

Når et prosjekt åpnes, kjører Nepos en **prosjektkontroll**: den sier fra om filer som kan oppdateres,
som må rettes, eller som har feil filnavn — og tilbyr å rette det som kan rettes automatisk.

### Fanene

| Fane | Hurtigtast | Hva du gjør der |
|---|---|---|
| **Rediger rutetabell** | Alt+1 | Linjens detaljer, tabellsett, kalendere og selve rutetabellen. Kartet ligger til venstre. |
| **Linjer** | Alt+2 | Alle linjene i én liste: finn, sorter, endre flere samtidig. |
| **Kalendere** | Alt+3 | Prosjektets kalendere (hvilke datoer noe kjører). |
| **Ressurser** | Alt+4 | Merkevarer og organisasjoner (autoriteter og operatører). |
| **Eksport** | Alt+5 | Kontroll og eksport til NeTEx. |
| **Oversikt** | Alt+6 | Det som trenger deg i dag: linjer som snart slutter å gå, linjer med feil, endringer som ikke er eksportert. Prosjektet åpner her. |

### Oversikt

Når du åpner et prosjekt, kommer du til **Oversikt**. Den sier med vanlige ord hva som trenger deg:

- **I dag** (store kort, hvert med én knapp): en linje som slutter å gå om under 30 dager (eller alt har sluttet), en
  linje med feil (feilene samlet etter type), og linjer som er endret siden forrige eksport.
- **Snart**: linjer som slutter å gå om 30–120 dager. Entur krever at dataene er gyldige i 120 dager når de leveres.
  Her står også linjer som ikke er eksportert på et halvt år, og linjer som bare har advarsler.
- En grønn linje når resten er i orden.
- **Gyldighet**: hver linje som eksporteres, frem til sin siste dag, med merker ved 30, 60, 90 og 120 dager.
- **Nettverket**: alle linjene som eksporteres på ett kart. Hver strekning tegnes én gang, tykkere der flere turer går,
  og rødt der en linje har feil.

Linjer som er satt til **Eksporteres ikke**, er ikke med. Nepos husker hver eksport (`data/exports.json`) fra denne
versjonen; før den første eksporten står linjene som «ingen eksport registrert».

---

## 2. Linjene

### Listen

Fanen **Linjer** viser alle linjene. Til venstre er verktøykassen:

- **Finn** — søk, og filtrer på kalender, transportmåte, organisasjon og status.
- **Verktøy** — **+ Ny linje**, **Rediger**, **Dupliser**, **Slett**, og under *Endre valgte* kan du
  sette merkevare, organisasjoner, kalender og flaggene for flere linjer samtidig.

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
- Dagkoder ryddes selv: DX76 blir DX67, 1234567 blir D. Ctrl+C / Ctrl+V kopierer en dagkode til en annen kolonne.
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
hoppes over; samme merknad gir samme bokstav). Linjen under tabellen viser alt om tiden du står i.

Velg et område med **Shift + piltaster** eller ved å **dra med musen**. **Ctrl+C / Ctrl+V** kopierer
og limer inn tider, også fra og til regneark. Limer du inn flere kolonner eller rader enn tabellen har,
legges de til (over 50 spør Nepos først).

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
  tabellen viser den («Venter opptil 15 minutter»).

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
  klokkeslett** (når bestille og siste bestillingstid) eller **som minst … før avgang**; **som mest før** kan settes i tillegg.
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
**Alt+J** / **Alt+I**), virker bare det verktøyet i tabellen — skriving, innliming og menyer er av, og resten av siden er dempet og låst (bare Lagre og Forkast virker). **Esc** slår det av. Med verktøyet av ser en blokk ut som vanlige kolonner, svakt skravert der du ikke kan skrive; med Virtuelle intervall på lyser alle blokkene opp.

- **Tidsforskyver** — et hjul (joggen) som flytter de valgte tidene ett minutt per hakk (Shift: ti): dra **ned** for senere, opp for tidligere (også hjulet og piltastene). Tallet (+8 min) gjelder de valgte tidene; velger du andre, toner det ut og starter på 0.
- **Virtuelle intervall** — dra en tur mot høyre for å gjenta den. Ett steg: en dialog der du skriver intervallet og
  siste avgang. To steg: hver time; tre: hver halvtime; så hvert 20., 15., 12. og 10. minutt. Drar du lenger, spør Nepos
  hvor ofte (hvert 6.–1. minutt). Tabellen viser første tur, én kolonne per minutt i timen og siste tur, for eksempel
  **06:05 | 35 05 | 08:05** for hver halvtime fra 06:05 til 08:05. Joggen i siste turs dagkode-celle flytter siste
  avgang med intervallet. Alt følger første tur: endrer du den, endres hele blokken. Blokken er låst og har en svak
  ramme; dra den tilbake til første tur for å fjerne den, eller **Pakk ut blokk** for å gjøre den til vanlige kolonner.
  Eksporten skriver alle turene. Intervaller som ikke går opp i en time (40 minutter), lager du med **Kopier med
  intervall**. En tur med korrespondanse kan ikke bli en blokk ennå.

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

Stripen under rutetabellen viser farten mellom stoppene for turen du står i, i luftlinje. Rødt betyr
at selv luftlinjen er for rask for transportmåten — da er en tid eller et stopp feil. Hold musen over
en bue for fart og avstand, klikk for å gå til raden.

En rød strekning stopper eksporten. Grensene per transportmiddel kan endres i **Prosjekt →
Prosjektinnstillinger → Fartsgrenser** (tomt felt = standard). Settes en grense mer enn 1,5 ganger over
standard, får eksporten en advarsel om at Entur kanskje ikke godtar så raske turer.

---

## 4. Stopp og kart

Kartet åpnes med **Alt+M** eller fanen **Kart** til venstre for rutetabellen.

- Øverst vises stoppet på raden du står i: navn, plattform, hva NSR vet om det (leskur, skilt,
  tilgjengelighet), ID-en med **Kopier** og en lenke til NSR.
- Står du i en stoppcelle og **skriver**, søker du etter stopp. Klikk stoppestedet i listen, og så
  plattformen — da er den satt på raden.
- På kartet vises plattformene når du zoomer inn. Klikk en plattform for å se den, og bruk **Bruk**,
  **↑ Legg til over** eller **↓ Legg til under** (også på høyreklikk).
- **Registrer stopp**: slå på, og klikk plattformene langs ruten i rekkefølge — hver legges til
  nederst. **Ctrl+Z** angrer det siste, **Esc** avslutter.
- **Ctrl+C / Ctrl+V på et stoppnavn** kopierer stoppet til en annen rad.
- **Tøm stopp** fjerner stoppet fra raden (navnet blir stående).

Nepos tilbyr bare stopp med samme transportmåte som linjen.

### Strekninger på kartet

Kartet bruker OpenFreeMap (lyst eller mørkt etter Nepos' utseende). Turen tegnes som rette linjer mellom
stoppene.

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
navn, kortkode (vises i rutetabellen i stedet for navnet), transportform (må være den samme som linjens; rutetabellen
viser bare kjøretøy som passer), drivstoff, lavgulv, sitteplasser, lengde, bredde og høyde i meter, en kjøretøytype-ID
som Nepos lager, og en VehicleTypeRef (du skriver delen etter `NMR:VehicleType:`). Fargen er bare fargen på
merkelappen i rutetabellen, ikke kjøretøyets farge. De eksporteres ikke ennå; senere skal et kjøretøy her vise til Entur sitt kjøretøyregister.

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

Hver tur blir en NeTEx ServiceJourney med én DatedServiceJourney for hver dag den kjører (kalender +
dagkode + turens egne datoer). Tognummer eksporteres som TrainNumber, andre turnummer som PrivateCode.


---

## 7. Hurtigtaster

Hele listen står i **Hjelp → Hurtigtaster**.
