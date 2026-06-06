export const TILE_TYPES = [
  "start",
  "property",
  "chance",
  "fate",
  "tax",
  "bonus",
  "rest",
  "teleport",
];

export function createDefaultBoard() {
  return [
    tile(0, "起點", "start", "經過或停在起點可獲得 500 金錢。"),
    property(1, "木橋市集", 450, 120, "人潮穩定的小市集。"),
    tile(2, "機會之門", "chance", "抽一張正面事件卡。"),
    property(3, "河畔工坊", 520, 150, "可以升級成高收益土地。"),
    tile(4, "城市稅務局", "tax", "繳納 180 金錢。", { amount: 180 }),
    tile(5, "安靜茶亭", "rest", "休息一回合，無事發生。"),
    property(6, "北門旅店", 600, 170, "旅人常停留的地點。"),
    tile(7, "命運岔路", "fate", "抽一張負面事件卡。"),
    property(8, "石板街", 680, 210, "收費穩定的街區。"),
    tile(9, "補給獎金", "bonus", "獲得 220 金錢。", { amount: 220 }),
    property(10, "山丘牧場", 720, 240, "升級後租金更高。"),
    tile(11, "傳送驛站", "teleport", "傳送到 15 號格。", { targetIndex: 15 }),
    tile(12, "中央廣場", "rest", "路過人很多，但今天平安無事。"),
    property(13, "鐵匠街", 780, 260, "中段熱門土地。"),
    tile(14, "機會信箱", "chance", "抽一張正面事件卡。"),
    property(15, "花園大道", 850, 300, "景觀漂亮，租金可觀。"),
    tile(16, "維修稅", "tax", "支付維修費 250 金錢。", { amount: 250 }),
    property(17, "港邊倉庫", 900, 330, "倉儲價值高。"),
    tile(18, "命運鐘樓", "fate", "抽一張負面事件卡。"),
    property(19, "黃金劇場", 980, 380, "高價值娛樂地。"),
    tile(20, "豐收獎金", "bonus", "獲得 300 金錢。", { amount: 300 }),
    property(21, "星光車站", 1050, 420, "後期關鍵土地。"),
    tile(22, "傳送門", "teleport", "傳送回 6 號格。", { targetIndex: 6 }),
    property(23, "天空莊園", 1200, 520, "棋盤上最昂貴的土地。"),
  ];
}

function tile(index, name, type, description, extra = {}) {
  return {
    id: `tile-${index}`,
    index,
    name,
    type,
    description,
    price: 0,
    rent: 0,
    ownerId: null,
    level: 0,
    ...extra,
  };
}

function property(index, name, price, rent, description) {
  return {
    ...tile(index, name, "property", description),
    price,
    rent,
    level: 1,
  };
}
