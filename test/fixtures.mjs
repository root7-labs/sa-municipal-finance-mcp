// Fixtures captured from the live Municipal Money API (Nov 2026) for Cape Town (CPT),
// Emfuleni (GT421) and Stellenbosch (WC024). Values in rands.
export const MUNICIPALITIES = [
  { "municipality.demarcation_code": "CPT", "municipality.name": "Cape Town", "municipality.long_name": "Cape Town, Western Cape", "municipality.parent_code": "WC", "municipality.province_name": "Western Cape", "municipality.province_code": "WC", "municipality.category": "A", "municipality.miif_category": "A", "municipality.phone_number": "021 400 1111", "municipality.url": "http://www.capetown.gov.za" },
  { "municipality.demarcation_code": "WC024", "municipality.name": "Stellenbosch", "municipality.long_name": "Stellenbosch, Western Cape", "municipality.parent_code": "DC2", "municipality.province_name": "Western Cape", "municipality.province_code": "WC", "municipality.category": "B", "municipality.miif_category": "B1" },
  { "municipality.demarcation_code": "GT421", "municipality.name": "Emfuleni", "municipality.long_name": "Emfuleni, Gauteng", "municipality.parent_code": "DC42", "municipality.province_name": "Gauteng", "municipality.province_code": "GT", "municipality.category": "B", "municipality.miif_category": "B1" },
  { "municipality.demarcation_code": "DC2", "municipality.name": "Cape Winelands", "municipality.long_name": "Cape Winelands, Western Cape", "municipality.parent_code": "WC", "municipality.province_name": "Western Cape", "municipality.province_code": "WC", "municipality.category": "C", "municipality.miif_category": "C2" },
  { "municipality.demarcation_code": "WC023", "municipality.name": "Drakenstein", "municipality.long_name": "Drakenstein, Western Cape", "municipality.parent_code": "DC2", "municipality.province_name": "Western Cape", "municipality.province_code": "WC", "municipality.category": "B", "municipality.miif_category": "B1" },
  // Treasury's directory still lists municipalities that were merged away in 2016, next to their successors.
  { "municipality.demarcation_code": "GT482", "municipality.name": "Randfontein", "municipality.long_name": "Randfontein, Gauteng", "municipality.parent_code": "DC48", "municipality.province_name": "Gauteng", "municipality.province_code": "GT", "municipality.category": "B", "municipality.miif_category": "B2" },
  { "municipality.demarcation_code": "GT485", "municipality.name": "Rand West City", "municipality.long_name": "Rand West City, Gauteng", "municipality.parent_code": "DC48", "municipality.province_name": "Gauteng", "municipality.province_code": "GT", "municipality.category": "B", "municipality.miif_category": "B2" },
  { "municipality.demarcation_code": "LIM342", "municipality.name": "Mutale", "municipality.long_name": "Mutale, Limpopo", "municipality.parent_code": "DC34", "municipality.province_name": "Limpopo", "municipality.province_code": "LIM", "municipality.category": "B", "municipality.miif_category": "B4" },
  { "municipality.demarcation_code": "LIM341", "municipality.name": "Musina", "municipality.long_name": "Musina, Limpopo", "municipality.parent_code": "DC34", "municipality.province_name": "Limpopo", "municipality.province_code": "LIM", "municipality.category": "B", "municipality.miif_category": "B3" },
  { "municipality.demarcation_code": "LIM343", "municipality.name": "Thulamela", "municipality.long_name": "Thulamela, Limpopo", "municipality.parent_code": "DC34", "municipality.province_name": "Limpopo", "municipality.province_code": "LIM", "municipality.category": "B", "municipality.miif_category": "B4" },
  { "municipality.demarcation_code": "EC128", "municipality.name": "Nxuba", "municipality.long_name": "Nxuba, Eastern Cape", "municipality.parent_code": "DC12", "municipality.province_name": "Eastern Cape", "municipality.province_code": "EC", "municipality.category": "B", "municipality.miif_category": "B3" },
  { "municipality.demarcation_code": "EC129", "municipality.name": "Raymond Mhlaba", "municipality.long_name": "Raymond Mhlaba, Eastern Cape", "municipality.parent_code": "DC12", "municipality.province_name": "Eastern Cape", "municipality.province_code": "EC", "municipality.category": "B", "municipality.miif_category": "B3" },
  { "municipality.demarcation_code": "EC131", "municipality.name": "Inxuba Yethemba", "municipality.long_name": "Inxuba Yethemba, Eastern Cape", "municipality.parent_code": "DC13", "municipality.province_name": "Eastern Cape", "municipality.province_code": "EC", "municipality.category": "B", "municipality.miif_category": "B3" },
  { "municipality.demarcation_code": "FS164", "municipality.name": "Naledi", "municipality.long_name": "Naledi, Free State", "municipality.parent_code": "DC16", "municipality.province_name": "Free State", "municipality.province_code": "FS", "municipality.category": "B", "municipality.miif_category": "B3" },
  { "municipality.demarcation_code": "MAN", "municipality.name": "Mangaung", "municipality.long_name": "Mangaung, Free State", "municipality.parent_code": "FS", "municipality.province_name": "Free State", "municipality.province_code": "FS", "municipality.category": "A", "municipality.miif_category": "A" },
  { "municipality.demarcation_code": "NW392", "municipality.name": "Naledi (NW)", "municipality.long_name": "Naledi (NW), North West", "municipality.parent_code": "DC39", "municipality.province_name": "North West", "municipality.province_code": "NW", "municipality.category": "B", "municipality.miif_category": "B3" },
];

// Rows from the demarcation_changes cube (captured Nov 2026): three mergers, one split, and one that is not a disestablishment.
export const DEMARCATION_CHANGES = [
  { "old_demarcation.code": "FS164", "new_demarcation.code": "MAN", "old_code_transition.code": "disestablished", "new_code_transition.code": "continue", "date.date": "2016-08-03" },
  { "old_demarcation.code": "EC128", "new_demarcation.code": "EC129", "old_code_transition.code": "disestablished", "new_code_transition.code": "established", "date.date": "2016-08-03" },
  { "old_demarcation.code": "GT482", "new_demarcation.code": "GT485", "old_code_transition.code": "disestablished", "new_code_transition.code": "established", "date.date": "2016-08-03" },
  { "old_demarcation.code": "LIM342", "new_demarcation.code": "LIM341", "old_code_transition.code": "disestablished", "new_code_transition.code": "continue", "date.date": "2016-08-03" },
  { "old_demarcation.code": "LIM342", "new_demarcation.code": "LIM343", "old_code_transition.code": "disestablished", "new_code_transition.code": "continue", "date.date": "2016-08-03" },
  { "old_demarcation.code": "LIM343", "new_demarcation.code": "LIM345", "old_code_transition.code": "continue", "new_code_transition.code": "established", "date.date": "2016-08-03" },
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

// Irregular expenditure from the uifwexp cube (captured Nov 2026). The latest audited year is 2023/24.
// A null amount means the municipality's figure was not reported, which is not the same as zero.
export const IRREGULAR = [
  { "demarcation.code": "CPT", "financial_year_end.year": 2023, "amount.sum": 11989000 },
  { "demarcation.code": "CPT", "financial_year_end.year": 2024, "amount.sum": 634262000 },
  { "demarcation.code": "GT421", "financial_year_end.year": 2024, "amount.sum": null },
];
export const CPT_2024_OPEX = 58313923784; // audited operating spending for 2023/24

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
