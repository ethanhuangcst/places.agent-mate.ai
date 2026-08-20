/**
 * Chinese city names for provider auto-selection.
 * Mainland China + Hong Kong + Macau. NOT Taiwan (AMAP has poor Taiwan coverage).
 */

const CHINA_CITIES_ZH: readonly string[] = [
  "北京", "上海", "天津", "重庆",
  "香港", "澳门",
  "广州", "深圳", "杭州", "南京", "成都", "武汉", "西安", "苏州",
  "长沙", "青岛", "大连", "厦门", "昆明", "哈尔滨", "沈阳", "济南",
  "郑州", "福州", "无锡", "合肥", "佛山", "东莞", "温州", "宁波",
  "南宁", "长春", "石家庄", "贵阳", "太原", "乌鲁木齐", "兰州",
  "海口", "三亚", "呼和浩特", "南昌", "拉萨", "西宁", "银川",
  "珠海", "中山", "汕头", "惠州", "湛江", "桂林", "柳州", "泉州",
  "烟台", "潍坊", "绍兴", "嘉兴", "金华", "台州", "洛阳", "襄阳",
  "宜昌", "常州", "徐州", "扬州", "镇江", "盐城", "南通", "连云港",
  "淄博", "威海", "泰安", "临沂", "德州", "聊城", "菏泽", "日照",
  "秦皇岛", "唐山", "保定", "邯郸", "廊坊", "沧州", "邢台",
  "大同", "吉林", "鞍山", "抚顺", "丹东", "锦州", "营口",
  "齐齐哈尔", "牡丹江", "佳木斯", "包头", "赤峰", "鄂尔多斯",
  "遵义", "曲靖", "玉溪", "大理", "丽江", "芜湖", "蚌埠", "马鞍山",
  "九江", "赣州", "上饶", "景德镇", "漳州", "龙岩", "莆田",
  "株洲", "湘潭", "衡阳", "岳阳", "常德", "邵阳",
  "南阳", "信阳", "许昌", "新乡", "焦作", "茂名", "江门", "肇庆",
  "北海", "钦州", "玉林", "梧州", "绵阳", "德阳", "宜宾", "泸州",
  "南充", "达州", "乐山", "自贡", "延安", "宝鸡", "咸阳", "渭南",
  "天水", "酒泉", "嘉峪关", "张掖", "克拉玛依", "喀什", "吐鲁番",
] as const;

const CHINA_CITIES_EN: Record<string, true> = {
  beijing: true, shanghai: true, guangzhou: true, shenzhen: true,
  chengdu: true, hangzhou: true, nanjing: true, wuhan: true,
  xian: true, "xi'an": true, suzhou: true, changsha: true,
  qingdao: true, dalian: true, xiamen: true, kunming: true,
  harbin: true, shenyang: true, jinan: true, tianjin: true,
  chongqing: true, zhengzhou: true, fuzhou: true, wuxi: true,
  hefei: true, foshan: true, dongguan: true, wenzhou: true,
  ningbo: true, nanning: true, changchun: true, shijiazhuang: true,
  guiyang: true, taiyuan: true, urumqi: true, lanzhou: true,
  haikou: true, sanya: true, hohhot: true, nanchang: true,
  lhasa: true, xining: true, yinchuan: true, zhuhai: true,
  guilin: true, lijiang: true, dali: true,
  "hong kong": true, hongkong: true, macau: true, macao: true,
};

/** Check if text mentions a Chinese city (mainland or HK/Macau, not Taiwan). */
export function matchesChinaCity(text: string): boolean {
  for (const city of CHINA_CITIES_ZH) {
    if (text.includes(city)) return true;
  }
  const lower = text.toLowerCase();
  for (const city of Object.keys(CHINA_CITIES_EN)) {
    if (lower.includes(city)) return true;
  }
  return false;
}
