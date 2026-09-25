// 배틀에서 쓸 수 없어 앞으로도 챔피언스에 들어오지 않을 도구. 도감과 선택 창에서 모두 뺀다.
// 이름 규칙으로 거르지 않고 목록으로 고정한다. 이름이 Z로 끝나는 메가스톤(앱솔나이트Z 등)이
// 있어 규칙으로 거르면 잘못 빠진다. 특정 포켓몬 전용 도구, 플레이트, 메가스톤은 모두 남긴다.
// 한국어 이름은 주석으로만 둔다. 확인한 경위는 docs/items.md에 있다.
export const EXCLUDED_ITEMS = new Set([
  // Z 크리스탈. Z기술이 챔피언스에 없다.
  'aloraichiumz', // 알로라이Z
  'buginiumz', // 벌레Z
  'darkiniumz', // 악Z
  'decidiumz', // 모크나이퍼Z
  'dragoniumz', // 드래곤Z
  'eeviumz', // 이브이Z
  'electriumz', // 전기Z
  'fairiumz', // 페어리Z
  'fightiniumz', // 격투Z
  'firiumz', // 불꽃Z
  'flyiniumz', // 비행Z
  'ghostiumz', // 고스트Z
  'grassiumz', // 풀Z
  'groundiumz', // 땅Z
  'iciumz', // 얼음Z
  'inciniumz', // 어흥염Z
  'kommoniumz', // 짜랑고우거Z
  'lunaliumz', // 루나아라Z
  'lycaniumz', // 루가루암Z
  'marshadiumz', // 마샤도Z
  'mewniumz', // 뮤Z
  'mimikiumz', // 따라큐Z
  'normaliumz', // 노말Z
  'pikaniumz', // 피카츄Z
  'pikashuniumz', // 지우피카Z
  'poisoniumz', // 독Z
  'primariumz', // 누리레느Z
  'psychiumz', // 에스퍼Z
  'rockiumz', // 바위Z
  'snorliumz', // 잠만보Z
  'solganiumz', // 솔가레오Z
  'steeliumz', // 강철Z
  'tapuniumz', // 카푸Z
  'ultranecroziumz', // 울트라네크로Z
  'wateriumz', // 물Z
  // 주얼. 5세대 뒤로 노말주얼 말고는 다시 나온 적이 없다. 노말주얼은 수록돼 있어 남긴다.
  'buggem', // 벌레주얼
  'darkgem', // 악주얼
  'dragongem', // 드래곤주얼
  'electricgem', // 전기주얼
  'fairygem', // 페어리주얼
  'fightinggem', // 격투주얼
  'firegem', // 불꽃주얼
  'flyinggem', // 비행주얼
  'ghostgem', // 고스트주얼
  'grassgem', // 풀주얼
  'groundgem', // 땅주얼
  'icegem', // 얼음주얼
  'poisongem', // 독주얼
  'psychicgem', // 에스퍼주얼
  'rockgem', // 바위주얼
  'steelgem', // 강철주얼
  'watergem', // 물주얼
  // 진화 도구. 지녀도 배틀 효과가 없다. 예리한손톱·예리한이빨·진화의휘석처럼 효과가 있는 것은 넣지 않는다.
  'dawnstone', // 각성의돌
  'duskstone', // 어둠의돌
  'firestone', // 불꽃의돌
  'icestone', // 얼음의돌
  'leafstone', // 리프의돌
  'moonstone', // 달의돌
  'shinystone', // 빛의돌
  'thunderstone', // 천둥의돌
  'waterstone', // 물의돌
  'electirizer', // 에레키부스터
  'magmarizer', // 마그마부스터
  'protector', // 프로텍터
  'reapercloth', // 영계의천
  'dubiousdisc', // 괴상한패치
  'prismscale', // 고운비늘
  'sachet', // 향기주머니
  'whippeddream', // 휘핑팝
  'sweetapple', // 달콤한사과
  'tartapple', // 새콤한사과
  'syrupyapple', // 꿀맛사과
  'chippedpot', // 이빠진포트
  'crackedpot', // 깨진포트
  'unremarkableteacup', // 범작찻잔
  'masterpieceteacup', // 걸작찻잔
  'berrysweet', // 베리사탕공예
  'cloversweet', // 네잎사탕공예
  'flowersweet', // 꽃사탕공예
  'lovesweet', // 하트사탕공예
  'ribbonsweet', // 리본사탕공예
  'starsweet', // 스타사탕공예
  'strawberrysweet', // 딸기사탕공예
  'auspiciousarmor', // 축복받은갑옷
  'maliciousarmor', // 저주받은갑옷
  'metalalloy', // 복합금속
  'ovalstone', // 동글동글돌
  // 화석.
  'armorfossil', // 방패의화석
  'clawfossil', // 발톱화석
  'coverfossil', // 덮개화석
  'domefossil', // 껍질화석
  'fossilizedbird', // 화석새
  'fossilizeddino', // 화석긴목
  'fossilizeddrake', // 화석용
  'fossilizedfish', // 화석물고기
  'helixfossil', // 조개화석
  'jawfossil', // 턱화석
  'plumefossil', // 깃털화석
  'rootfossil', // 뿌리화석
  'sailfossil', // 지느러미화석
  'skullfossil', // 두개의화석
  'oldamber', // 비밀의호박
  // 육성·판매용.
  'bignugget', // 큰금구슬
  'bottlecap', // 은색병뚜껑
  'goldbottlecap', // 금색병뚜껑
  'prettyfeather', // 고운깃털
  'rarebone', // 귀중한뼈
  'galaricacuff', // 가라두구팔찌
  'galaricawreath', // 가라두구머리장식
]);

// 불러온 도감에서 뺀다. 원본을 바꾸지 않고 도구만 새로 만든다.
export const pruneItems = reference =>
  reference?.held_item
    ? {
        ...reference,
        held_item: Object.fromEntries(
          Object.entries(reference.held_item).filter(([id]) => !EXCLUDED_ITEMS.has(id)),
        ),
      }
    : reference;
