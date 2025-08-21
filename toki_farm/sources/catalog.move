module toki_farm::catalog {
    use std::string::{String, utf8, concat};
    use std::vector;
    use sui::object::{Self, UID};
    use sui::table::{Self as table, Table};
    use sui::transfer;
    use sui::tx_context::TxContext;

    /// 파츠 코드 고정 (프론트, 민팅 로직과 맞춰 쓰기)
    const PART_BASE:  u8 = 0;
    const PART_EARS:  u8 = 1;
    const PART_EYES:  u8 = 2;
    const PART_MOUTH: u8 = 3;

    /// 눈/입/귀 등에서 쓰는 u8 코드들 (파일명 기준)
    /// Base
    const BASE_BASIC:   u8 = 0;
    const BASE_DANCING: u8 = 1;

    /// Ears
    const EARS_LONG:  u8 = 0;
    const EARS_SHORT: u8 = 1;

    /// Eyes
    const EYES_BASIC:  u8 = 0;
    const EYES_ANGRY:  u8 = 1;
    const EYES_SLEEPY: u8 = 2;
    const EYES_SMILE:  u8 = 3;

    /// Mouth
    const MOUTH_DOT:       u8 = 0;
    const MOUTH_ANGRY:     u8 = 1;
    const MOUTH_KISS:      u8 = 2;
    const MOUTH_SURPRISED: u8 = 3;

    /// 파츠 정보 (이름, 파일명) — URL은 base_url + filename 으로 만든다
    struct PartInfo has store {
        name: String,
        filename: String, // 예: "eyes_sleepy.png"
    }

    /// 카탈로그 본체 (불변으로 얼릴 대상)
    /// - base_url: 공통 경로(예: "https://raw.githubusercontent.com/..../assets" 또는 "ipfs://<CID>")
    struct Catalog has key, store {
        id: UID,
        version: u64,
        base_url: String,
        base:  Table<u8, PartInfo>,
        ears:  Table<u8, PartInfo>,
        eyes:  Table<u8, PartInfo>,
        mouth: Table<u8, PartInfo>,
    }

    /// ---------- 생성기 ----------

    /// base_url과 정해진 파일명 매핑으로 카탈로그를 만들고 바로 immutable로 고정
    public entry fun init_default(base_url: String, ctx: &mut TxContext) {
        let mut c = Catalog {
            id: object::new(ctx),
            version: 1,
            base_url,
            base:  table::new<u8, PartInfo>(ctx),
            ears:  table::new<u8, PartInfo>(ctx),
            eyes:  table::new<u8, PartInfo>(ctx),
            mouth: table::new<u8, PartInfo>(ctx),
        };

        // Base
        table::add(&mut c.base, BASE_BASIC,   PartInfo { name: utf8(b"base_basic"),   filename: utf8(b"base_basic.png") });
        table::add(&mut c.base, BASE_DANCING, PartInfo { name: utf8(b"base_dancing"), filename: utf8(b"base_dancing.png") });

        // Ears
        table::add(&mut c.ears, EARS_LONG,  PartInfo { name: utf8(b"ears_long"),  filename: utf8(b"ears_long.png") });
        table::add(&mut c.ears, EARS_SHORT, PartInfo { name: utf8(b"ears_short"), filename: utf8(b"ears_short.png") });

        // Eyes
        table::add(&mut c.eyes, EYES_BASIC,  PartInfo { name: utf8(b"eyes_basic"),  filename: utf8(b"eyes_basic.png") });
        table::add(&mut c.eyes, EYES_ANGRY,  PartInfo { name: utf8(b"eyes_angry"),  filename: utf8(b"eyes_angry.png") });
        table::add(&mut c.eyes, EYES_SLEEPY, PartInfo { name: utf8(b"eyes_sleepy"), filename: utf8(b"eyes_sleepy.png") });
        table::add(&mut c.eyes, EYES_SMILE,  PartInfo { name: utf8(b"eyes_smile"),  filename: utf8(b"eyes_smile.png") });

        // Mouth
        table::add(&mut c.mouth, MOUTH_DOT,       PartInfo { name: utf8(b"mouth_dot"),       filename: utf8(b"mouth_dot.png") });
        table::add(&mut c.mouth, MOUTH_ANGRY,     PartInfo { name: utf8(b"mouth_angry"),     filename: utf8(b"mouth_angry.png") });
        table::add(&mut c.mouth, MOUTH_KISS,      PartInfo { name: utf8(b"mouth_kiss"),      filename: utf8(b"mouth_kiss.png") });
        table::add(&mut c.mouth, MOUTH_SURPRISED, PartInfo { name: utf8(b"mouth_surprised"), filename: utf8(b"mouth_surprised.png") });

        // immutable로 고정 (소유권 없음, 누구나 참조 가능)
        transfer::freeze_object(c);
    }

    /// 커스텀 데이터로 초기화하고 고정하고 싶을 때 쓰는 버전 (선택)
    public entry fun init_with_data(
        version: u64,
        base_url: String,
        base_in:  vector<(u8, String, String)>,  // (code, name, filename)
        ears_in:  vector<(u8, String, String)>,
        eyes_in:  vector<(u8, String, String)>,
        mouth_in: vector<(u8, String, String)>,
        ctx: &mut TxContext
    ) {
        let mut c = Catalog {
            id: object::new(ctx),
            version,
            base_url,
            base:  table::new<u8, PartInfo>(ctx),
            ears:  table::new<u8, PartInfo>(ctx),
            eyes:  table::new<u8, PartInfo>(ctx),
            mouth: table::new<u8, PartInfo>(ctx),
        };

        fill(&mut c.base,  base_in);
        fill(&mut c.ears,  ears_in);
        fill(&mut c.eyes,  eyes_in);
        fill(&mut c.mouth, mouth_in);

        transfer::freeze_object(c);
    }

    fun fill(tbl: &mut Table<u8, PartInfo>, mut v: vector<(u8, String, String)>) {
        let n = vector::length<&(u8, String, String)>(&v);
        let mut i = 0;
        while (i < n) {
            let (code, name, filename) = vector::pop_back<&(u8, String, String)>(&mut v);
            table::add(tbl, code, PartInfo { name, filename });
            i = i + 1;
        }
    }

    /// ---------- 조회기 ----------

    public fun get_name(c: &Catalog, part_kind: u8, code: u8): &String {
        &borrow_info(c, part_kind, code).name
    }

    /// 최종 이미지 URL = base_url + "/" + filename
    public fun get_image_url(c: &Catalog, part_kind: u8, code: u8): String {
        let info = borrow_info(c, part_kind, code);
        concat(&concat(&c.base_url, &utf8(b"/")), &info.filename)
    }

    public fun get_version(c: &Catalog): u64 { c.version }

    /// 내부 라우팅
    fun borrow_info(c: &Catalog, part_kind: u8, code: u8): &PartInfo {
        if (part_kind == PART_BASE) {
            table::borrow(&c.base, code)
        } else if (part_kind == PART_EARS) {
            table::borrow(&c.ears, code)
        } else if (part_kind == PART_EYES) {
            table::borrow(&c.eyes, code)
        } else {
            // mouth
            table::borrow(&c.mouth, code)
        }
    }
}
