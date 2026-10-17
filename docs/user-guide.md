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
  deler med andre eller tar sikkerhetskopi av.
- `private/` — dine egne innstillinger (språk, fargetema). Deles ikke.
- `exports/` — NeTEx-filene, én undermappe for hver eksport.

### Nytt prosjekt eller åpne et som finnes

- **Prosjekt → Nytt prosjekt…**: gi prosjektet et navn og et *codespace* (tre store bokstaver, for
  eksempel `TST`; codespacet får du av Entur). Velg så en tom mappe.
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

Linjeflaggene **Eksporter ikke** og **Ikke åpen rute** settes fra listen på **Linjer**.

### Lagre

Endringer er ulagrede til du lagrer: **Ctrl+S** lagrer linjen du står i, **Ctrl+Shift+S** lagrer
alt (linjer, kalendere og ressurser). Du kan bytte mellom linjer uten å lagre — endringene følger
linjen til du lagrer eller forkaster dem (**Rediger → Forkast alle endringer**).

---

## 3. Rutetabellen

### Tabellsett og kalendere

En linje har ett eller flere **tabellsett** — fanene over rutetabellen, for eksempel «Bergen–Oslo»
og «Oslo–Bergen». **+** lager et nytt.

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

### Skrive tider

Velg en celle og skriv tiden (`0715` eller `715`), Enter. `|` betyr at turen passerer stoppet uten å
stoppe. Etter tiden kan du skrive `a` (bare avstigning), `p` (bare påstigning) eller `x` (stopper ved
behov) — eller sette det fra høyreklikkmenyen for alle valgte celler.

Velg et område med **Shift + piltaster** eller ved å **dra med musen**. **Ctrl+C / Ctrl+V** kopierer
og limer inn tider, også fra og til regneark.

### Verktøy på høyreklikk

På en tid:

- **≈ Interpoler tider** — fyller de tomme cellene mellom tidene du har skrevet, fordelt etter
  avstanden mellom stoppene. Står du i én celle, gjelder det hele kolonnen; har du valgt et område,
  bare mellom tidene i området. Skriv første og siste tid (eller tidene ved hovedstoppene), interpoler,
  og rett det som må rettes.
- **⇅ Forskyv tider…** — et lite hjul som flytter de valgte tidene ett minutt per hakk (Shift: ti).
  Det blir stående åpent mens du velger andre celler; lukk med ✕ eller Esc.
- **Kun avstigning / Kun påstigning / Stopper ved behov / Ingen begrensning**.
- **Merknad** (eller F7) og **Datoer for tiden…**.
- **Korrespondanse** (garantert eller bli sittende) til en annen tur.

På en dagkode:

- **Kopier med intervall…** — for eksempel 08:00 hver time til 15:00. Dialogen sier hvor mange
  kolonner den lager. Kopier som starter etter midnatt får dagkoden flyttet en dag.
- **Sorter kolonnene** etter avgang, eller etter dagkode og så avgang.
- **Merknad** og **Datoer for turen…**.

### Merknader og datoer

- En **merknad** er en tekst på en tur eller en enkelt tid. Ctrl+Enter bruker den.
- **Datoer** er unntak fra kalenderen for en tur: velg **+ Kjører også** eller **− Kjører ikke** og
  klikk eller dra over dagene. Datoer på en tur eksporteres. Datoer på en enkelt tid lagres, men
  eksporteres ikke ennå (eksportkontrollen sier fra).

### Fartsprofilen

Stripen under rutetabellen viser farten mellom stoppene for turen du står i, i luftlinje. Rødt betyr
at selv luftlinjen er for rask for transportmåten — da er en tid eller et stopp feil. Hold musen over
en bue for fart og avstand, klikk for å gå til raden.

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

---

## 6. Eksport

På **Eksport** kontrollerer Nepos hele prosjektet først. **Feil** må rettes før eksport; **advarsler**
er ting du bør se på. **Eksporter NeTEx** skriver filene til `exports/` (som ZIP hvis du vil). Linjer
merket **Eksporter ikke** kommer ikke med.

Hver tur blir en NeTEx ServiceJourney med én DatedServiceJourney for hver dag den kjører (kalender +
dagkode + turens egne datoer). Tognummer eksporteres som TrainNumber, andre turnummer som PrivateCode.

---

## 7. Hurtigtaster

Hele listen står i **Hjelp → Hurtigtaster**.
