// Fixtures captured from the live Municipal Money API (Nov 2026) for Cape Town (CPT),
// Emfuleni (GT421) and Stellenbosch (WC024). Values in rands.
export const MUNICIPALITIES = [
  { "municipality.demarcation_code": "CPT", "municipality.name": "Cape Town", "municipality.long_name": "Cape Town, Western Cape", "municipality.parent_code": "WC", "municipality.province_name": "Western Cape", "municipality.province_code": "WC", "municipality.category": "A", "municipality.miif_category": "A", "municipality.phone_number": "021 400 1111", "municipality.url": "http://www.capetown.gov.za" },
  { "municipality.demarcation_code": "WC024", "municipality.name": "Stellenbosch", "municipality.long_name": "Stellenbosch, Western Cape", "municipality.parent_code": "DC2", "municipality.province_name": "Western Cape", "municipality.province_code": "WC", "municipality.category": "B", "municipality.miif_category": "B1" },
  { "municipality.demarcation_code": "GT421", "municipality.name": "Emfuleni", "municipality.long_name": "Emfuleni, Gauteng", "municipality.parent_code": "DC42", "municipality.province_name": "Gauteng", "municipality.province_code": "GT", "municipality.category": "B", "municipality.miif_category": "B1" },
  { "municipality.demarcation_code": "DC2", "municipality.name": "Cape Winelands", "municipality.long_name": "Cape Winelands, Western Cape", "municipality.parent_code": "WC", "municipality.province_name": "Western Cape", "municipality.province_code": "WC", "municipality.category": "C", "municipality.miif_category": "C2" },
  { "municipality.demarcation_code": "WC023", "municipality.name": "Drakenstein", "municipality.long_name": "Drakenstein, Western Cape", "municipality.parent_code": "DC2", "municipality.province_name": "Western Cape", "municipality.province_code": "WC", "municipality.category": "B", "municipality.miif_category": "B1" },
];

// Cape Town 2024/25 audited (FY end 2025). Municipal Money shows: cash R19 174 907 809,
// cash coverage 3.6 months, current ratio 1.70, liquidity 1.10, collection rate 94.4%, R&M 1.1%.
export const CPT_2025 = {
  cash: 19174907809,
  collected: 44701701867,
  billed: 47364095979,
  opex: { AUDA: 63938772101, ORGB: 64668000000 },
  capex: { AUDA: 9323404398, ORGB: 12073000000 },
  rm: 804803802,
  // financial position items chosen to reproduce the published ratios
  fp: { "0120": 16608000000, "0130": 9088247619, "0380": 15086578580, "0230": 71412000000 },
};

// Latest monthly creditor ageing (FY2026 period 9 = Mar 2026)
export const CREDITORS = {
  CPT: [
    ["0700", -87310879, -32814, -855296, 0, 0, 0, 0, -1352, -88200341],
    ["0900", -21818579, 0, 0, 0, 0, 0, 0, 0, -21818579],
  ],
  GT421: [
    ["0100", -50000000, -25000000, -28000000, -100000000, -100000000, -100000000, -800000000, -7086000000, -8289000000],
    ["0200", 0, 0, 0, -45000000, -50000000, -50000000, -300000000, -1500000000, -1840000000],
    ["0700", -10000000, -8000000, -6000000, -9000000, -5000000, -5000000, -15000000, -20000000, -78000000],
  ],
};
export const BUCKETS = ["l30", "l60", "l90", "l120", "l150", "l180", "l1", "g1", "total"];
