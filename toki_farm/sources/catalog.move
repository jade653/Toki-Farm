module toki_farm::catalog;

use std::string::{Self, String, utf8};
use sui::object::{Self as object, UID};
use sui::table::{Self as table, Table};
use sui::transfer;
use sui::tx_context::TxContext;

/// 공통 이미지 베이스 URL (IPFS 게이트웨이) / Common image base URL (IPFS Gateway)
fun base_url(): String {
    utf8(b"https://ipfs.io/ipfs/QmbDLs5mJfaTpeK7oFzRRvczEW9FpX8kb8tMMiznMh2pFk")
}

/// 파츠 종류
const PART_BASE:  u8 = 0;
const PART_EARS:  u8 = 1;
const PART_EYES:  u8 = 2;
const PART_MOUTH: u8 = 3;

/// u8 코드 매핑 (파일명 기준)
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

/// 파츠 정보 (표시 이름 + 파일명)
public struct PartInfo has copy, drop, store {
    name: String,
    filename: String, // 예: "eyes_sleepy.png"
}

/// 카탈로그 (immutable로 freeze할 대상)
public struct Catalog has key, store {
    id: UID,
    version: u64,
    base_url: String,
    base:  Table<u8, PartInfo>,
    ears:  Table<u8, PartInfo>,
    eyes:  Table<u8, PartInfo>,
    mouth: Table<u8, PartInfo>,
}

/// -------- 생성기 --------
/// IPFS BASE_URL을 사용해 카탈로그 생성 후 즉시 immutable로 고정
fun init(ctx: &mut TxContext) {
    let mut c = Catalog {
        id: object::new(ctx),
        version: 1,
        base_url: base_url(),
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

    transfer::freeze_object(c);
}

/// -------- 조회기 --------
public fun get_version(c: &Catalog): u64 { c.version }

public fun get_name(c: &Catalog, part_kind: u8, code: u8): &String {
    &borrow_info(c, part_kind, code).name
}

/// 최종 이미지 URL = base_url + "/" + filename
public fun get_image_url(c: &Catalog, part_kind: u8, code: u8): String {
    let info = *borrow_info(c, part_kind, code);
    let mut url = c.base_url;
    string::append_utf8(&mut url, b"/");
    string::append(&mut url, info.filename);
    url
}

/// 내부 라우팅
fun borrow_info(c: &Catalog, part_kind: u8, code: u8): &PartInfo {
    if (part_kind == PART_BASE) {
        table::borrow(&c.base, code)
    } else if (part_kind == PART_EARS) {
        table::borrow(&c.ears, code)
    } else if (part_kind == PART_EYES) {
        table::borrow(&c.eyes, code)
    } else {
        table::borrow(&c.mouth, code)
    }
}
