// Guided tours: a sequence of landmarks the map flies between, one card at a time.

export const TOURS = [
  { id: 'lutyens', name: "Lutyens' Delhi", blurb: 'The imperial capital of the 1920s and 30s, from Raisina Hill to Connaught Place.',
    stops: ['rashtrapati-bhavan', 'north-block', 'south-block', 'parliament', 'india-gate', 'connaught-place'] },
  { id: 'mughal', name: 'Mughal Delhi', blurb: "Shahjahanabad's fort and mosque, Humayun's garden tomb and the older Purana Qila.",
    stops: ['red-fort', 'jama-masjid', 'purana-qila', 'humayun-tomb'] },
  { id: 'sultanate', name: 'Sultanate ruins', blurb: 'Five centuries before the Mughals: towers, tombs and a lost fortress city.',
    stops: ['qutub-minar', 'hauz-khas', 'lodhi-tomb', 'tughlakabad'] },
  { id: 'faith', name: 'Places of faith', blurb: 'A gurudwara, temples old and new, and the great mosque.',
    stops: ['bangla-sahib', 'birla-mandir', 'jama-masjid', 'lotus-temple', 'akshardham'] },
  { id: 'modern', name: 'Modern Delhi', blurb: 'Stadiums, the railway, a cable-stayed bridge and the airport.',
    stops: ['new-delhi-station', 'jln-stadium', 'bharat-mandapam', 'signature-bridge', 'igi-airport'] },
];

// Wikipedia article for each landmark, for the summary in its card.
export const WIKI = {
  'india-gate': 'India Gate',
  'rashtrapati-bhavan': 'Rashtrapati Bhavan',
  'north-block': 'North Block',
  'south-block': 'South Block',
  parliament: 'Parliament House (India)',
  'connaught-place': 'Connaught Place',
  'jantar-mantar': 'Jantar Mantar, New Delhi',
  'bangla-sahib': 'Gurudwara Bangla Sahib',
  'birla-mandir': 'Laxminarayan Temple',
  'new-delhi-station': 'New Delhi railway station',
  'red-fort': 'Red Fort',
  'jama-masjid': 'Jama Masjid, Delhi',
  rajghat: 'Raj Ghat and associated memorials',
  'bharat-mandapam': 'Bharat Mandapam',
  'purana-qila': 'Purana Qila',
  'humayun-tomb': "Humayun's tomb",
  'lodhi-tomb': 'Lodhi Gardens',
  'jln-stadium': 'Jawaharlal Nehru Stadium, Delhi',
  'lotus-temple': 'Lotus Temple',
  akshardham: 'Akshardham (Delhi)',
  'qutub-minar': 'Qutb Minar',
  'hauz-khas': 'Hauz Khas Complex',
  tughlakabad: 'Tughlaqabad Fort',
  'signature-bridge': 'Signature Bridge',
  'igi-airport': 'Indira Gandhi International Airport',
};
