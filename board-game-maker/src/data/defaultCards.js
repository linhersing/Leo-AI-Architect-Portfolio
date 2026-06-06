export function createDefaultCards() {
  return {
    chance: [
      { id: "chance-1", title: "市場加成", description: "你的小生意突然爆紅，獲得 300 金錢。", amount: 300 },
      { id: "chance-2", title: "投資回饋", description: "早期投資回收，獲得 450 金錢。", amount: 450 },
      { id: "chance-3", title: "好友支援", description: "朋友幫你介紹客源，獲得 220 金錢。", amount: 220 },
      { id: "chance-4", title: "幸運折扣", description: "銀行退還手續費，獲得 180 金錢。", amount: 180 },
    ],
    fate: [
      { id: "fate-1", title: "設備維修", description: "臨時維修支出，失去 260 金錢。", amount: -260 },
      { id: "fate-2", title: "交通罰單", description: "超速被罰，失去 180 金錢。", amount: -180 },
      { id: "fate-3", title: "市場低迷", description: "收入下滑，失去 320 金錢。", amount: -320 },
      { id: "fate-4", title: "合約延誤", description: "案子晚付款，失去 220 金錢。", amount: -220 },
    ],
  };
}
