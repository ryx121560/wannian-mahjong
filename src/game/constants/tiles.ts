export const suitMap: Record<string, string> = {
  wan: "万",
  tong: "筒",
  tiao: "条",
};

export const honorMap: Record<string, string> = {
  dong: "东",
  nan: "南",
  xi: "西",
  bei: "北",
  zhong: "中",
  fa: "发",
  bai: "白",
};

export const honorOrder: Record<string, number> = {
  dong: 0,
  nan: 1,
  xi: 2,
  bei: 3,
  zhong: 4,
  fa: 5,
  bai: 6,
};

export const suitOrder: Record<string, number> = {
  wan: 0,
  tong: 1,
  tiao: 2,
};

export const ALL_KEYS: string[] = (() => {
  const keys: string[] = [];
  for (const suit of ["wan", "tong", "tiao"]) {
    for (let value = 1; value <= 9; value++) keys.push(`${suit}${value}`);
  }
  for (const honor of ["dong", "nan", "xi", "bei", "zhong", "fa", "bai"]) {
    keys.push(honor);
  }
  return keys;
})();

export const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export const pathNames: Record<string, string> = {
  norm: "面子手",
  "7p": "七对子",
  dalan: "打烂",
  quanzheng: "全正宗",
  banzheng: "半正宗",
};

export const suitCN: Record<string, string> = {
  wan: "万",
  tong: "筒",
  tiao: "条",
};
