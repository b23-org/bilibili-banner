export interface RegionInfo {
  readonly name: string;
  readonly id: number;
  readonly route?: string;
  readonly channelId: number;
}

export const REGIONS: readonly RegionInfo[] = [
  { name: "主站", id: 0, channelId: 0 },
  { name: "影视", id: 1001, route: "cinephile", channelId: 12 },
  { name: "娱乐", id: 1002, route: "ent", channelId: 13 },
  { name: "音乐", id: 1003, route: "music", channelId: 10 },
  { name: "舞蹈", id: 1004, route: "dance", channelId: 11 },
  { name: "动画", id: 1005, route: "douga", channelId: 7 },
  { name: "绘画", id: 1006, route: "painting", channelId: 24 },
  { name: "鬼畜", id: 1007, route: "kichiku", channelId: 9 },
  { name: "游戏", id: 1008, route: "game", channelId: 8 },
  { name: "资讯", id: 1009, route: "information", channelId: 16 },
  { name: "知识", id: 1010, route: "knowledge", channelId: 14 },
  { name: "人工智能", id: 1011, route: "ai", channelId: 25 },
  { name: "科技数码", id: 1012, route: "tech", channelId: 15 },
  { name: "汽车", id: 1013, route: "car", channelId: 19 },
  { name: "时尚美妆", id: 1014, route: "fashion", channelId: 20 },
  { name: "家装房产", id: 1015, route: "home", channelId: 26 },
  { name: "户外潮流", id: 1016, route: "outdoors", channelId: 27 },
  { name: "健身", id: 1017, route: "gym", channelId: 28 },
  { name: "体育运动", id: 1018, route: "sports", channelId: 21 },
  { name: "手工", id: 1019, route: "handmake", channelId: 29 },
  { name: "美食", id: 1020, route: "food", channelId: 17 },
  { name: "小剧场", id: 1021, route: "shortplay", channelId: 18 },
  { name: "旅游出行", id: 1022, route: "travel", channelId: 30 },
  { name: "三农", id: 1023, route: "rural", channelId: 31 },
  { name: "动物", id: 1024, route: "animal", channelId: 22 },
  { name: "亲子", id: 1025, route: "parenting", channelId: 32 },
  { name: "健康", id: 1026, route: "health", channelId: 33 },
  { name: "情感", id: 1027, route: "emotion", channelId: 34 },
  { name: "神秘学", id: 1028, route: "mysticism", channelId: 44 },
  { name: "vlog", id: 1029, route: "vlog", channelId: 23 },
  { name: "生活兴趣", id: 1030, route: "life_joy", channelId: 35 },
  { name: "生活经验", id: 1031, route: "life_experience", channelId: 36 },
];

/**
 * 根据分区 tid 检索分区元数据
 */
export function findRegionById(tid: number): RegionInfo | undefined {
  return REGIONS.find((region) => region.id === tid);
}

/**
 * 获取指定 tid 的可读展示名称（0 为首页主站）
 */
export function getRegionDisplayName(tid: number): string {
  const found = findRegionById(tid);
  return found ? found.name : `分区#${tid}`;
}
