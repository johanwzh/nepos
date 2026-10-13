// Made-up sample project used by the parity and unit tests. Not real data.

export const TIMESTAMP = '2026-01-01T00:00:00';

const crlf = (lines) => lines.join('\r\n') + '\r\n';

const route10 = crlf([
  '#LEV;Testprosjekt;TST;Test Creator;creator@example.invalid',
  '#RUT;-1;10;Bergen - Florø;;6;',
  '#SEK;1;Fjordbåt AS;1;1;0;0',
  '#SEK;2;Vestland fylkeskommune;1;0;0;0',
  '#CUR;spd;9',
  '#TRA;10',
  '#PER;Sommer;20260601;20260831;;;',
  '#KOM;Korrespondanse med buss i Florø.',
  '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0;',
  '#TUR;1;DX67;0;0;0;0;',
  '#TUR;2;135;0;0;0;0;',
  '#TRL;0;101;Bergen;34;1;-1;-1;34;-1',
  '#TRC;0;0800;0;0;0;0;0',
  '#TRC;1;1400;0;0;0;0;0',
  '#TRC;2;2200;0;0;0;0;0',
  '#TRL;1;102;Askvoll;34;0;12.500000;-1;34;-1',
  '#TRC;0;1030;0;0;0;0;8',
  '#TRC;1;|;0;0;0;0;0',
  '#TRC;2;0030;1;0;0;0;0',
  '#TRL;2;103;Florø;34;2;-1;-1;34;-1',
  '#TRC;0;1200;0;0;0;0;1',
  '#TRC;1;1630;0;0;0;0;0',
  '#TRL;3;103;Florø;34;0;-1;-1;34;-1',
  '#TRC;0;1215;0;0;1;0;1026',
  '#TRC;1;1645;0;0;0;0;0',
  '#FOT;2;-1;Kjører ikke i fellesferien.;0',
  '#UNT;2;-1;20260706;16384;20260802;16384;0;0;',
  '#UNT;1;-1;20260615;8192;20260615;8192;0;0;',
  '#TAB;1;;;;',
  '#TUR;0;D;0;0;0;0;',
  '#TRL;0;103;Florø;34;0;-1;-1;34;-1',
  '#TRC;0;0600;0;0;0;0;0',
  '#TRL;1;999;Ukjent brygge;34;0;-1;-1;34;-1',
  '#TRC;0;0700;0;0;0;0;0',
  '#TRL;2;101;Bergen;34;0;-1;-1;34;-1',
  '#TRC;0;0930;0;0;0;0;0',
]);

const route20 = crlf([
  '#LEV;Testprosjekt;TST;Test Creator;creator@example.invalid',
  '#RUT;-1;20;Florø - Eikefjord;;1;',
  '#SEK;3;Kystbuss AS;0;1;0;0',
  '#CUR;neposcoin;1',
  '#TRA;20',
  '#PER;Vinter;20260101;20260531;;;',
  '#TAB;0;;;;',
  '#TUR;0;DX67;0;0;0;0;',
  '#TRL;0;104;Florø skysstasjon;34;0;-1;-1;34;-1',
  '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;105;Eikefjord;34;0;-1;-1;34;-1',
  '#TRC;0;0745;0;0;0;0;0',
  '#PER;Sommer;20260601;20260831;;;',
  '#TAB;0;;;;',
  '#TUR;0;67;0;0;0;0;',
  '#TRL;0;104;Florø skysstasjon;34;0;-1;-1;34;-1',
  '#TRC;0;0900;0;0;0;0;0',
  '#TRL;1;105;Eikefjord;34;0;-1;-1;34;-1',
  '#TRC;0;0945;0;0;0;0;0',
]);

export const sample = {
  delivery: {
    name: 'Testprosjekt',
    codespace: 'TST',
    creator: 'Test Creator',
    creatorEmail: 'creator@example.invalid',
  },
  orgs: [
    { id: 1, name: 'Fjordbåt AS' },
    { id: 2, name: 'Vestland fylkeskommune' },
    { id: 3, name: 'Kystbuss AS' },
  ],
  // 1.x-style stop database: IDs are strings, as they were in geodata.geojson.
  stopDb: [
    { id: '101', name: 'Bergen',            coords: [5.3221, 60.3929], mode: 'water', spt: 'ferryPort' },
    { id: '102', name: 'Askvoll',           coords: [5.0631, 61.3468], mode: 'water', spt: 'ferryPort' },
    { id: '103', name: 'Florø',             coords: [5.0328, 61.5996], mode: 'water', spt: 'ferryPort' },
    { id: '104', name: 'Florø skysstasjon', coords: [5.0350, 61.6000], mode: 'bus',   spt: 'onstreetBus' },
    { id: '105', name: 'Eikefjord',         coords: [5.4500, 61.5890], mode: 'bus',   spt: 'onstreetBus' },
  ],
  routes: [
    { code: '10', text: route10 },
    { code: '20', text: route20 },
  ],
};
