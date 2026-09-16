export const stores = new Set(["岩槻本店", "桶川店", "平塚店", "ふじみ野店", "美女木店", "鶴瀬店"]);

export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10),
    finalDay: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10),
  };
}
