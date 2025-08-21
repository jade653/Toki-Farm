module toki_farm::creature;

use std::string::{String};
use sui::table::{Self, Table};
use sui::tx_context::{sender};
use sui::bcs::{Self};
use sui::hash;

// locus
const BASE: u8  = 0;
const EAR: u8   = 1;
const EYE: u8   = 2;
const MOUTH: u8 = 3;

// Owned NFT : Toki
public struct Toki has key, store {
    id: UID,
    name: Option<String>,
    parent_a: Option<address>,
    parent_b: Option<address>,
    phenotype: Phenotype,
    genes: Table<u8, GenePair>,   // locus -> GenePair
    image_url: Option<String>,
}

 // 유전자 한 쌍 (a1: 부모A, a2: 부모B, rule: 0=랜덤, 1=우열)
public struct GenePair has copy, drop, store {
    a1: u8,
    a2: u8,
    rule: u8,
}

// 표현형
public struct Phenotype has copy, drop, store {
    base: u8,
    ear: u8,
    eye: u8,
    mouth: u8
}

// ─────────────────────────────────────────────────────────────
// Utils : allele 추출 및 phenotype 결정
// ─────────────────────────────────────────────────────────────
public fun get_allele(g: &GenePair, bit: bool): u8 {
    if (bit) g.a1 else g.a2
}

public fun child_gene_from_parents(
    parent_a: &Toki,
    parent_b: &Toki,
    locus: u8,
    sndr: address,
    salt: u64
): GenePair {
    let gene_a = table::borrow(&parent_a.genes, locus);
    let gene_b = table::borrow(&parent_b.genes, locus);
    let a = get_allele(gene_a, rng_bit(sndr, salt));       // A에서 1개
    let b = get_allele(gene_b, rng_bit(sndr, salt + 777)); // B에서 1개
    GenePair { a1: a, a2: b, rule: gene_a.rule }
}

// Decide which allele to express based on the rule.
// If rule is 1, return the larger allele; otherwise, return a random one.
public fun decide_expression(g: &GenePair, sndr: address, salt: u64): u8 {
    if (g.rule == 1) {
        if (g.a1 > g.a2) g.a1 else g.a2
    } else {
        get_allele(g, rng_bit(sndr, salt))
    }
}

// rule=1(우열)은 큰 값이 발현, 나머지는 랜덤 선택(간단 규칙)
public fun get_phenotype(
    base: &GenePair, ear: &GenePair, eye: &GenePair, mouth: &GenePair,
    sndr: address, salt: u64
): Phenotype {
    let base_code  = decide_expression(base,  sndr, salt + 10);
    let ear_code   = decide_expression(ear,   sndr, salt + 11);
    let eye_code   = decide_expression(eye,   sndr, salt + 12);
    let mouth_code = decide_expression(mouth, sndr, salt + 13);
    Phenotype { base: base_code, ear: ear_code, eye: eye_code, mouth: mouth_code }
}

// ─────────────────────────────────────────────────────────────
// 자식 NFT 민팅(breed):
// - 두 부모 읽기
// - 각 locus별로 자식 유전자 생성(여기서만 RNG 사용)
// - 표현형은 결정적으로 계산
// ─────────────────────────────────────────────────────────────
public(package) fun breed(
    parent_a: &Toki,
    parent_b: &Toki,
    ctx: &mut TxContext
) {
    let sndr = sender(ctx);

    // 각 좌위별 자식 유전자 생성
    let base  = child_gene_from_parents(parent_a, parent_b, BASE,  sndr, 0);
    let ear   = child_gene_from_parents(parent_a, parent_b, EAR,   sndr, 1);
    let eye   = child_gene_from_parents(parent_a, parent_b, EYE,   sndr, 2);
    let mouth = child_gene_from_parents(parent_a, parent_b, MOUTH, sndr, 3);

    // genes 테이블 구성
    let mut genes: Table<u8, GenePair> = table::new<u8, GenePair>(ctx);
    table::add(&mut genes, BASE, base);
    table::add(&mut genes, EAR, ear);
    table::add(&mut genes, EYE, eye);
    table::add(&mut genes, MOUTH, mouth);

    // 표현형은 결정적 계산
    let ph = get_phenotype(&base, &ear, &eye, &mouth, sndr, 0);

    // 부모 id 주소
    let a_id = object::id_address(parent_a);
    let b_id = object::id_address(parent_b);

    // 자식 민팅
    let child = Toki {
        id: object::new(ctx),
        name: option::none<String>(),
        parent_a: option::some<address>(a_id),
        parent_b: option::some<address>(b_id),
        phenotype: ph,
        genes,
        image_url: option::none<String>()
    };

    transfer::public_transfer(child, sndr);
}

// ─────────────────────────────────────────────────────────────
// init minting : 시조 NFT (genes 직접 입력)
// ─────────────────────────────────────────────────────────────
entry fun mint_init(
    base_a1: u8, base_a2: u8, base_rule: u8,
    ear_a1: u8, ear_a2: u8, ear_rule: u8,
    eye_a1: u8, eye_a2: u8, eye_rule: u8,
    mouth_a1: u8, mouth_a2: u8, mouth_rule: u8,
    pheno_base: u8, pheno_ear: u8, pheno_eye: u8, pheno_mouth: u8,
    ctx: &mut TxContext
) {
    let mut genes: Table<u8, GenePair> = table::new<u8, GenePair>(ctx);
    table::add(&mut genes, BASE, GenePair { a1: base_a1, a2: base_a2, rule: base_rule });
    table::add(&mut genes, EAR, GenePair { a1: ear_a1, a2: ear_a2, rule: ear_rule });
    table::add(&mut genes, EYE, GenePair { a1: eye_a1, a2: eye_a2, rule: eye_rule });
    table::add(&mut genes, MOUTH, GenePair { a1: mouth_a1, a2: mouth_a2, rule: mouth_rule });

    // 표현형은 인자로 직접 지정 / Phenotype is specified directly as an argument
    let ph = Phenotype {
        base: pheno_base, ear: pheno_ear, eye: pheno_eye, mouth: pheno_mouth
    };

    let toki = Toki {
        id: object::new(ctx),
        name: option::none<String>(),
        parent_a: option::none<address>(),
        parent_b: option::none<address>(),
        phenotype: ph,
        genes,
        image_url: option::none<String>()
    };

    transfer::public_transfer(toki, sender(ctx));
}

// ─────────────────────────────────────────────────────────────
// Details 갱신: 이름, 이미지 URL
// ─────────────────────────────────────────────────────────────
public entry fun set_toki_details(
    toki: &mut Toki,
    name: String,
    image_url: String,
    _ctx: &mut TxContext
) {
    // &mut Toki를 인자로 받으므로, ctx.sender()가 소유자임이 강제됨
    toki.name = option::some(name);
    toki.image_url = option::some(image_url);
}

// RNG (MVP용 간단구현)
public fun rng_u64(sndr: address, salt: u64): u64 {
    let mut seed = bcs::to_bytes(&sndr); 
    let salt_bytes = bcs::to_bytes(&salt); 
    vector::append(&mut seed, salt_bytes);
    let digest = hash::keccak256(&seed);
    let mut reader = bcs::new(digest);
    bcs::peel_u64(&mut reader)
}

public fun rng_bit(sndr: address, salt: u64): bool {
    (rng_u64(sndr, salt) & 1) == 1
}

// 테스트 편의: 이미지 없이 민트/브리드하는 헬퍼
entry fun mint_init_noimg(
    base_a1: u8, base_a2: u8, base_rule: u8,
    ear_a1: u8, ear_a2: u8, ear_rule: u8,
    eye_a1: u8, eye_a2: u8, eye_rule: u8,
    mouth_a1: u8, mouth_a2: u8, mouth_rule: u8,
    pheno_base: u8, pheno_ear: u8, pheno_eye: u8, pheno_mouth: u8,
    ctx: &mut TxContext
) {
    mint_init(base_a1, base_a2, base_rule, ear_a1, ear_a2, ear_rule, eye_a1, eye_a2, eye_rule, mouth_a1, mouth_a2, mouth_rule, pheno_base, pheno_ear, pheno_eye, pheno_mouth, ctx)
}

entry fun breed_noimg(parent_a: &Toki, parent_b: &Toki, ctx: &mut TxContext) {
    breed(parent_a, parent_b, ctx)
}