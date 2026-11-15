// Geography of Delhi used to build the isometric map.
//
// Everything here is plain [lat, lon] data, approximate and hand-picked from
// public maps. The map is a stylised diorama, not a survey: positions are good
// to a tile or two (one tile is roughly 185 m), which is plenty to put the Red
// Fort on the right bank of the Yamuna and Connaught Place at the centre.

export const BOUNDS = { latMin: 28.475, latMax: 28.74, lonMin: 77.05, lonMax: 77.35 };
export const GRID = 160;

// The Yamuna, north to south.
export const YAMUNA = [
  [28.745, 77.212], [28.73, 77.22], [28.715, 77.228], [28.7, 77.233],
  [28.685, 77.236], [28.67, 77.24], [28.66, 77.248], [28.645, 77.256],
  [28.63, 77.258], [28.615, 77.262], [28.6, 77.267], [28.585, 77.275],
  [28.57, 77.285], [28.555, 77.298], [28.54, 77.305], [28.52, 77.312],
  [28.5, 77.318], [28.47, 77.325],
];

// Lakes as circles; r is in tiles.
export const LAKES = [
  { name: 'Hauz Khas Lake', c: [28.5545, 77.1925], r: 1.3 },
  { name: 'Bhalswa Lake', c: [28.7385, 77.163], r: 2.2 },
  { name: 'Sanjay Lake', c: [28.613, 77.303], r: 1.4 },
  { name: 'Purana Qila Lake', c: [28.6075, 77.2405], r: 0.7 },
];

// Land use. Later entries win. Polygons are [lat, lon] rings; circles carry a
// radius in tiles.
export const ZONES = [
  // Outer farmland in the north and north-west.
  { type: 'farm', poly: [[28.745, 77.04], [28.745, 77.2], [28.728, 77.2], [28.722, 77.12], [28.703, 77.085], [28.682, 77.04]] },
  { type: 'farm', poly: [[28.6, 77.04], [28.6, 77.06], [28.555, 77.065], [28.53, 77.04]] },
  // Chhatarpur farmhouses south of Vasant Kunj.
  { type: 'estate', poly: [[28.515, 77.15], [28.515, 77.205], [28.49, 77.205], [28.49, 77.15]] },
  // Unplanned, dense trans-Yamuna and south.
  { type: 'dense', poly: [[28.735, 77.25], [28.735, 77.36], [28.64, 77.36], [28.635, 77.3], [28.645, 77.255]] },
  { type: 'dense', poly: [[28.52, 77.225], [28.52, 77.245], [28.5, 77.245], [28.5, 77.225]] },
  { type: 'dense', poly: [[28.69, 77.12], [28.69, 77.16], [28.67, 77.16], [28.67, 77.12]] },
  // Planned sub-cities.
  { type: 'midrise', poly: [[28.63, 77.04], [28.63, 77.075], [28.598, 77.078], [28.575, 77.07], [28.565, 77.04]] },
  { type: 'midrise', poly: [[28.735, 77.085], [28.735, 77.13], [28.7, 77.135], [28.7, 77.09]] },
  { type: 'midrise', poly: [[28.625, 77.28], [28.625, 77.31], [28.595, 77.31], [28.595, 77.28]] },
  { type: 'midrise', poly: [[28.535, 77.145], [28.535, 77.17], [28.515, 77.17], [28.515, 77.145]] },
  // Gurugram and Noida skylines.
  { type: 'towers', poly: [[28.475, 77.04], [28.512, 77.04], [28.512, 77.105], [28.495, 77.13], [28.475, 77.13]] },
  { type: 'towers', poly: [[28.6, 77.312], [28.6, 77.36], [28.515, 77.36], [28.515, 77.33], [28.555, 77.31]] },
  // Industrial estates.
  { type: 'industrial', poly: [[28.54, 77.262], [28.54, 77.285], [28.52, 77.285], [28.52, 77.262]] },
  { type: 'industrial', c: [28.628, 77.14], r: 3.5 },
  { type: 'industrial', c: [28.7, 77.165], r: 3.5 },
  { type: 'industrial', c: [28.637, 77.118], r: 3 },
  // Old Delhi: Shahjahanabad.
  { type: 'old', poly: [[28.667, 77.215], [28.667, 77.246], [28.641, 77.246], [28.641, 77.215]] },
  // Lutyens' Delhi and Chanakyapuri: bungalows under trees.
  { type: 'lutyens', poly: [[28.636, 77.192], [28.636, 77.232], [28.6, 77.237], [28.583, 77.226], [28.582, 77.17], [28.6, 77.168]] },
  // Commercial centres.
  { type: 'commercial', c: [28.6315, 77.2167], r: 5.5 },
  { type: 'commercial', c: [28.549, 77.252], r: 2.5 },
  { type: 'commercial', c: [28.651, 77.19], r: 3 },
  { type: 'commercial', c: [28.568, 77.187], r: 1.8 },
  { type: 'commercial', c: [28.548, 77.122], r: 2.6 },
  { type: 'commercial', c: [28.629, 77.241], r: 2 },
  { type: 'commercial', c: [28.57, 77.322], r: 2.5 },
  // Ridge forests.
  { type: 'forest', poly: [[28.648, 77.182], [28.645, 77.198], [28.628, 77.2], [28.603, 77.183], [28.596, 77.164], [28.62, 77.163]] },
  { type: 'forest', poly: [[28.557, 77.152], [28.556, 77.178], [28.536, 77.183], [28.524, 77.168], [28.536, 77.148]] },
  { type: 'forest', poly: [[28.503, 77.205], [28.503, 77.252], [28.475, 77.272], [28.475, 77.195]] },
  { type: 'forest', poly: [[28.688, 77.217], [28.69, 77.223], [28.672, 77.227], [28.667, 77.221]] },
  // Airport.
  { type: 'airport', poly: [[28.588, 77.04], [28.588, 77.108], [28.562, 77.126], [28.532, 77.118], [28.532, 77.04]] },
  // Gardens and green lungs.
  { type: 'park', c: [28.5931, 77.2197], r: 2.2 }, // Lodhi Garden
  { type: 'park', c: [28.5835, 77.1925], r: 1.8 }, // Nehru Park
  { type: 'park', c: [28.555, 77.196], r: 2.2 }, // Deer Park, Hauz Khas
  { type: 'park', c: [28.5955, 77.2445], r: 1.6 }, // Sunder Nursery
  { type: 'park', c: [28.597, 77.231], r: 2.2 }, // Delhi Golf Club
  { type: 'park', c: [28.623, 77.197], r: 1.6 }, // Talkatora Garden
  { type: 'park', c: [28.726, 77.215], r: 2.5 }, // Yamuna Biodiversity Park
  { type: 'park', c: [28.72, 77.11], r: 1.6 }, // Japanese Park, Rohini
  { type: 'park', c: [28.513, 77.197], r: 1.4 }, // Garden of Five Senses
  { type: 'park', poly: [[28.658, 77.244], [28.658, 77.252], [28.628, 77.256], [28.628, 77.249]] }, // Rajghat and riverside memorials
  { type: 'park', c: [28.6, 77.256], r: 1.8 }, // Millennium Park
  { type: 'park', c: [28.6129, 77.2295], r: 3.2 }, // India Gate C-Hexagon
  // Kartavya Path lawns between Raisina Hill and India Gate.
  { type: 'lawn', poly: [[28.6155, 77.2105], [28.6155, 77.227], [28.6103, 77.227], [28.6103, 77.2105]] },
];

// Roads. "major" carries traffic; "avenue" is quieter.
export const ROADS = [
  { name: 'Ring Road', cls: 'major', loop: true, pts: [
    [28.71, 77.18], [28.69, 77.155], [28.665, 77.13], [28.645, 77.122], [28.63, 77.135],
    [28.592, 77.162], [28.578, 77.175], [28.568, 77.207], [28.57, 77.225], [28.57, 77.24],
    [28.572, 77.258], [28.59, 77.259], [28.625, 77.253], [28.645, 77.249], [28.668, 77.231],
    [28.69, 77.227], [28.702, 77.226], [28.71, 77.2] ] },
  { name: 'Outer Ring Road', cls: 'major', pts: [
    [28.735, 77.17], [28.72, 77.13], [28.7, 77.1], [28.672, 77.07], [28.64, 77.075],
    [28.62, 77.08], [28.59, 77.11], [28.565, 77.155], [28.555, 77.17], [28.533, 77.208],
    [28.537, 77.226], [28.548, 77.25], [28.552, 77.268], [28.535, 77.29], [28.52, 77.3] ] },
  { name: 'NH 48', cls: 'major', pts: [[28.592, 77.162], [28.565, 77.135], [28.545, 77.12], [28.51, 77.1], [28.475, 77.075]] },
  { name: 'Mathura Road', cls: 'major', pts: [[28.616, 77.236], [28.605, 77.244], [28.589, 77.25], [28.572, 77.258], [28.55, 77.278], [28.52, 77.292], [28.49, 77.305], [28.475, 77.31]] },
  { name: 'Aurobindo Marg', cls: 'major', pts: [[28.6, 77.212], [28.568, 77.207], [28.548, 77.204], [28.524, 77.19], [28.505, 77.175], [28.475, 77.15]] },
  { name: 'DND Flyway', cls: 'major', pts: [[28.572, 77.258], [28.575, 77.28], [28.577, 77.31], [28.57, 77.35]] },
  { name: 'NH 9', cls: 'major', pts: [[28.59, 77.259], [28.605, 77.275], [28.62, 77.305], [28.63, 77.35]] },
  { name: 'Vikas Marg', cls: 'major', pts: [[28.629, 77.241], [28.631, 77.26], [28.632, 77.285], [28.64, 77.35]] },
  { name: 'GT Karnal Road', cls: 'major', pts: [[28.668, 77.231], [28.69, 77.205], [28.71, 77.18], [28.745, 77.16]] },
  { name: 'Rohtak Road', cls: 'major', pts: [[28.655, 77.205], [28.665, 77.16], [28.672, 77.11], [28.68, 77.04]] },
  { name: 'Najafgarh Road', cls: 'major', pts: [[28.645, 77.18], [28.648, 77.14], [28.645, 77.122], [28.625, 77.08], [28.61, 77.04]] },
  { name: 'Mehrauli–Gurgaon Road', cls: 'major', pts: [[28.524, 77.19], [28.505, 77.16], [28.49, 77.12], [28.475, 77.1]] },
  { name: 'Wazirabad Road', cls: 'major', pts: [[28.71, 77.2], [28.7046, 77.218], [28.7046, 77.255], [28.698, 77.29]] },
  { name: 'Airport Road', cls: 'major', pts: [[28.545, 77.12], [28.552, 77.1], [28.556, 77.093]] },
  { name: 'Chandni Chowk', cls: 'avenue', pts: [[28.6562, 77.2375], [28.6565, 77.2225]] },
  { name: 'Netaji Subhash Marg', cls: 'avenue', pts: [[28.6455, 77.2375], [28.668, 77.231]] },
  { name: 'Minto Road', cls: 'avenue', pts: [[28.6355, 77.2185], [28.645, 77.226], [28.6455, 77.2375]] },
  { name: 'Janpath', cls: 'avenue', pts: [[28.627, 77.218], [28.6129, 77.219]] },
  { name: 'Kasturba Gandhi Marg', cls: 'avenue', pts: [[28.6275, 77.2205], [28.6145, 77.2265]] },
  { name: 'Akbar Road', cls: 'avenue', pts: [[28.611, 77.228], [28.6, 77.213]] },
  { name: 'Lodhi Road', cls: 'avenue', pts: [[28.59, 77.205], [28.588, 77.235], [28.589, 77.25]] },
  { name: 'Shanti Path', cls: 'avenue', pts: [[28.61, 77.193], [28.592, 77.183], [28.578, 77.175]] },
  { name: 'Baba Kharak Singh Marg', cls: 'avenue', pts: [[28.6275, 77.2135], [28.62, 77.204]] },
  { name: 'ITO–Tilak Marg', cls: 'avenue', pts: [[28.6145, 77.2325], [28.629, 77.241]] },
];

// The ceremonial axis gets its own red-gravel boulevard.
export const KARTAVYA_PATH = { name: 'Kartavya Path', pts: [[28.6129, 77.2055], [28.6129, 77.2275]] };

export const RAILWAYS = [
  { name: 'Northern Railway', pts: [[28.745, 77.185], [28.69, 77.2], [28.661, 77.226], [28.643, 77.2195], [28.62, 77.2], [28.6, 77.19], [28.56, 77.17], [28.5, 77.14], [28.475, 77.125]] },
  { name: 'Old Iron Bridge line', pts: [[28.661, 77.226], [28.663, 77.243], [28.664, 77.26], [28.672, 77.3], [28.68, 77.35]] },
  { name: 'Nizamuddin line', pts: [[28.643, 77.2195], [28.63, 77.235], [28.588, 77.253], [28.55, 77.27], [28.5, 77.298], [28.475, 77.31]] },
];

export const METRO = [
  { id: 'yellow', name: 'Yellow Line', color: '#f2c618', stations: [
    ['Samaypur Badli', 28.745, 77.138], ['Jahangirpuri', 28.726, 77.163], ['Azadpur', 28.707, 77.18],
    ['Vishwavidyalaya', 28.695, 77.215], ['Kashmere Gate', 28.667, 77.228], ['Chandni Chowk', 28.658, 77.23],
    ['New Delhi', 28.643, 77.222], ['Rajiv Chowk', 28.633, 77.219], ['Central Secretariat', 28.615, 77.212],
    ['INA', 28.575, 77.209], ['Hauz Khas', 28.543, 77.206], ['Qutub Minar', 28.513, 77.186],
    ['Sultanpur', 28.499, 77.161], ['Guru Dronacharya', 28.482, 77.103] ] },
  { id: 'blue', name: 'Blue Line', color: '#2f6fd6', stations: [
    ['Dwarka', 28.615, 77.05], ['Janakpuri West', 28.629, 77.078], ['Rajouri Garden', 28.649, 77.123],
    ['Kirti Nagar', 28.656, 77.151], ['Karol Bagh', 28.644, 77.189], ['Rajiv Chowk', 28.633, 77.219],
    ['Mandi House', 28.626, 77.234], ['Indraprastha', 28.62, 77.25], ['Yamuna Bank', 28.623, 77.267],
    ['Akshardham', 28.618, 77.279], ['Mayur Vihar', 28.604, 77.289], ['Noida Sector 15', 28.585, 77.312],
    ['Botanical Garden', 28.564, 77.334], ['Noida City Centre', 28.575, 77.35] ] },
  { id: 'violet', name: 'Violet Line', color: '#8b3fb0', stations: [
    ['Kashmere Gate', 28.667, 77.228], ['Lal Qila', 28.657, 77.236], ['ITO', 28.628, 77.241],
    ['Mandi House', 28.626, 77.234], ['Khan Market', 28.603, 77.228], ['JLN Stadium', 28.59, 77.233],
    ['Lajpat Nagar', 28.57, 77.236], ['Kalkaji Mandir', 28.55, 77.258], ['Govind Puri', 28.544, 77.264],
    ['Mohan Estate', 28.52, 77.288], ['Badarpur', 28.493, 77.303], ['Sarai', 28.475, 77.31] ] },
  { id: 'orange', name: 'Airport Express', color: '#e8762d', stations: [
    ['New Delhi', 28.643, 77.222], ['Shivaji Stadium', 28.629, 77.211], ['Dhaula Kuan', 28.592, 77.162],
    ['Aerocity', 28.549, 77.121], ['IGI Airport', 28.556, 77.087], ['Dwarka Sector 21', 28.553, 77.058] ] },
];

// Airport runways, as [lat, lon] end points; drawn on the airport zone.
export const RUNWAYS = [
  [[28.577, 77.068], [28.577, 77.106]],
  [[28.542, 77.066], [28.542, 77.104]],
  [[28.562, 77.05], [28.583, 77.075]],
];

// Landmarks. w is the footprint along longitude (east), d along latitude
// (south), both in tiles; the footprint is centred on [lat, lon].
export const LANDMARKS = [
  { id: 'india-gate', name: 'India Gate', hi: 'इंडिया गेट', lat: 28.6129, lon: 77.2295, w: 2, d: 2,
    era: '1931', text: 'The All-India War Memorial: a 42 m arch by Edwin Lutyens bearing the names of soldiers who died in the First World War. It anchors the east end of Kartavya Path.' },
  { id: 'rashtrapati-bhavan', name: 'Rashtrapati Bhavan', hi: 'राष्ट्रपति भवन', lat: 28.6143, lon: 77.1994, w: 5, d: 4,
    era: '1929', text: 'Residence of the President of India on Raisina Hill. Lutyens mixed a Buddhist stupa-like dome with Mughal chhatris and red Dholpur sandstone; the Amrit Udyan gardens lie behind it.' },
  { id: 'north-block', name: 'North Block', hi: 'नॉर्थ ब्लॉक', lat: 28.6156, lon: 77.2085, w: 2, d: 1,
    era: '1931', text: 'One of Herbert Baker’s twin Secretariat buildings flanking Raisina Hill, long home to the finance and home ministries.' },
  { id: 'south-block', name: 'South Block', hi: 'साउथ ब्लॉक', lat: 28.6102, lon: 77.2085, w: 2, d: 1,
    era: '1931', text: 'The southern twin of the Secretariat, housing the Prime Minister’s Office and the ministries of defence and external affairs.' },
  { id: 'parliament', name: 'Sansad Bhavan', hi: 'संसद भवन', lat: 28.6187, lon: 77.2095, w: 3, d: 2,
    era: '1927 / 2023', text: 'India’s Parliament: the circular colonnaded house of 1927 and, beside it, the triangular new building inaugurated in 2023.' },
  { id: 'connaught-place', name: 'Connaught Place', hi: 'कनॉट प्लेस', lat: 28.6315, lon: 77.2167, w: 5, d: 5,
    era: '1933', text: 'Two concentric rings of white Georgian colonnades around Central Park, built as New Delhi’s commercial heart. Rajiv Chowk metro station lies underneath.' },
  { id: 'jantar-mantar', name: 'Jantar Mantar', hi: 'जंतर मंतर', lat: 28.6243, lon: 77.2166, w: 1, d: 1,
    era: '1724', text: 'An open-air observatory of giant masonry instruments built by Maharaja Sawai Jai Singh II, including a huge sundial, the Samrat Yantra.' },
  { id: 'bangla-sahib', name: 'Gurudwara Bangla Sahib', hi: 'गुरुद्वारा बंगला साहिब', lat: 28.6264, lon: 77.2091, w: 2, d: 2,
    era: '1783', text: 'A Sikh gurudwara linked to Guru Har Krishan, the eighth Guru. Its golden dome rises over a holy sarovar, and the langar serves free meals to all.' },
  { id: 'birla-mandir', name: 'Laxminarayan Temple', hi: 'लक्ष्मीनारायण मंदिर', lat: 28.6327, lon: 77.1993, w: 2, d: 2,
    era: '1939', text: 'Better known as Birla Mandir; built by the Birla family and inaugurated by Mahatma Gandhi on the condition that it be open to people of all castes.' },
  { id: 'new-delhi-station', name: 'New Delhi Railway Station', hi: 'नई दिल्ली रेलवे स्टेशन', lat: 28.6425, lon: 77.2195, w: 2, d: 2,
    era: '1956', text: 'One of the busiest railway stations in India, sitting between Paharganj and the walled city.' },
  { id: 'red-fort', name: 'Red Fort', hi: 'लाल क़िला', lat: 28.6562, lon: 77.241, w: 3, d: 5,
    era: '1639–1648', text: 'Shah Jahan’s palace-fortress of red sandstone, once on the bank of the Yamuna. The Prime Minister speaks from its Lahori Gate every Independence Day. UNESCO World Heritage Site.' },
  { id: 'jama-masjid', name: 'Jama Masjid', hi: 'जामा मस्जिद', lat: 28.6507, lon: 77.2334, w: 2, d: 2,
    era: '1656', text: 'Shah Jahan’s great mosque, with three marble domes, two 40 m minarets and a courtyard that holds 25,000 people.' },
  { id: 'rajghat', name: 'Rajghat', hi: 'राजघाट', lat: 28.6406, lon: 77.2495, w: 2, d: 2,
    era: '1948', text: 'A black marble platform marking the spot where Mahatma Gandhi was cremated, with an eternal flame at one end.' },
  { id: 'bharat-mandapam', name: 'Bharat Mandapam', hi: 'भारत मंडपम', lat: 28.6195, lon: 77.2435, w: 2, d: 2,
    era: '2023', text: 'The convention centre at Pragati Maidan that hosted the G20 Leaders’ Summit in September 2023.' },
  { id: 'purana-qila', name: 'Purana Qila', hi: 'पुराना क़िला', lat: 28.6096, lon: 77.2437, w: 3, d: 3,
    era: '1530s–1540s', text: 'The Old Fort, begun by Humayun and finished by Sher Shah Suri, on a mound that may hide the ancient city of Indraprastha.' },
  { id: 'humayun-tomb', name: 'Humayun’s Tomb', hi: 'हुमायूँ का मक़बरा', lat: 28.5933, lon: 77.2507, w: 3, d: 3,
    era: 'c. 1570', text: 'The first great garden-tomb of the subcontinent, built for the Mughal emperor Humayun in a four-part charbagh. A model for the Taj Mahal. UNESCO World Heritage Site.' },
  { id: 'lodhi-tomb', name: 'Lodhi Garden Tombs', hi: 'लोधी गार्डन', lat: 28.5931, lon: 77.2197, w: 1, d: 1,
    era: '15th c.', text: 'Tombs of the Sayyid and Lodi dynasties, among them Mohammed Shah’s octagonal tomb (1444), inside a 90-acre park.' },
  { id: 'jln-stadium', name: 'Jawaharlal Nehru Stadium', hi: 'जवाहरलाल नेहरू स्टेडियम', lat: 28.5828, lon: 77.2344, w: 3, d: 3,
    era: '1982', text: 'Built for the 1982 Asian Games and given its white tensile roof for the 2010 Commonwealth Games.' },
  { id: 'lotus-temple', name: 'Lotus Temple', hi: 'लोटस टेम्पल', lat: 28.5535, lon: 77.2588, w: 2, d: 2,
    era: '1986', text: 'The Baháʼí House of Worship: 27 free-standing marble-clad petals in clusters of three, ringed by nine pools. Open to people of every faith.' },
  { id: 'akshardham', name: 'Akshardham', hi: 'अक्षरधाम', lat: 28.6127, lon: 77.2773, w: 3, d: 3,
    era: '2005', text: 'Swaminarayan Akshardham: a richly carved pink sandstone and marble monument surrounded by a two-storey colonnade, gardens and a lake.' },
  { id: 'qutub-minar', name: 'Qutub Minar', hi: 'क़ुतुब मीनार', lat: 28.5245, lon: 77.1855, w: 2, d: 2,
    era: 'c. 1199–1220', text: 'A 72.5 m fluted minaret of red sandstone and marble, begun by Qutb ud-Din Aibak and finished by Iltutmish. Next to it stands the rust-free iron pillar. UNESCO World Heritage Site.' },
  { id: 'hauz-khas', name: 'Hauz Khas Complex', hi: 'हौज़ ख़ास', lat: 28.5532, lon: 77.1948, w: 2, d: 1,
    era: '14th c.', text: 'Firuz Shah Tughlaq’s madrasa and tomb on the edge of Alauddin Khalji’s royal reservoir.' },
  { id: 'tughlakabad', name: 'Tughlaqabad Fort', hi: 'तुग़लक़ाबाद क़िला', lat: 28.5108, lon: 77.2613, w: 3, d: 3,
    era: '1321', text: 'The ruined rubble-stone citadel of Ghiyath al-Din Tughluq, with massive sloping walls and round bastions.' },
  { id: 'signature-bridge', name: 'Signature Bridge', hi: 'सिग्नेचर ब्रिज', lat: 28.7046, lon: 77.2335, w: 1, d: 1, onWater: true,
    era: '2018', text: 'A cable-stayed bridge across the Yamuna at Wazirabad, whose bent steel pylon rises 154 m.' },
  { id: 'igi-airport', name: 'IGI Airport T3', hi: 'इंदिरा गांधी अंतर्राष्ट्रीय हवाई अड्डा', lat: 28.5585, lon: 77.0875, w: 3, d: 2,
    era: '2010', text: 'Terminal 3 of Indira Gandhi International, India’s busiest airport.' },
];

export const DISTRICT_LABELS = [
  ['Old Delhi', 28.66, 77.228], ['Karol Bagh', 28.652, 77.19], ['Paharganj', 28.645, 77.21],
  ['Civil Lines', 28.681, 77.225], ['North Campus', 28.69, 77.208], ['Model Town', 28.715, 77.19],
  ['Rohini', 28.718, 77.105], ['Pitampura', 28.698, 77.135], ['Punjabi Bagh', 28.668, 77.13],
  ['Rajouri Garden', 28.646, 77.12], ['Janakpuri', 28.62, 77.085], ['Dwarka', 28.597, 77.058],
  ['Aerocity', 28.548, 77.122], ['Vasant Kunj', 28.525, 77.157], ['Mehrauli', 28.515, 77.18],
  ['Saket', 28.527, 77.21], ['Greater Kailash', 28.543, 77.238], ['Hauz Khas', 28.548, 77.205],
  ['Lajpat Nagar', 28.567, 77.244], ['Defence Colony', 28.574, 77.232], ['Nehru Place', 28.549, 77.252],
  ['Chanakyapuri', 28.596, 77.186], ['Lutyens’ Delhi', 28.604, 77.21], ['Okhla', 28.53, 77.275],
  ['Mayur Vihar', 28.607, 77.293], ['Laxmi Nagar', 28.634, 77.277], ['Preet Vihar', 28.643, 77.297],
  ['Shahdara', 28.674, 77.29], ['Noida', 28.57, 77.335], ['Gurugram', 28.492, 77.08],
  ['Asola Bhatti', 28.488, 77.228], ['Central Ridge', 28.627, 77.18], ['Yamuna', 28.69, 77.238, 'water'],
];
