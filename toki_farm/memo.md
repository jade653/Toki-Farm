module toki_farm::farm;

use std::string::{String};
use std::option::{Self, Option};
use sui::tx_context::{sender, TxContext};
use sui::coin::{Coin};
use sui::sui::SUI;
use sui::table::{Self, Table};
use sui::transfer;
use sui::object::{Self, ID, UID};
use sui::pay;

use toki_farm::creature::{Self, Toki};

/// ===== Constants=====
const TREASURY: address = @0x7eb454f344351e89e49e40b40f139c3c5bb96affda0653689a332cb64c00c157;
const PLATFORM_FEE_PPM: u64 = 10_000;   // 1% = 10,000 / 1,000,000
const PPM_DENOM: u64 = 1_000_000;

/// ===== Farm (Shared Object) =====
public struct Farm has key {
    id: UID,
    listings: Table<ID, Listing>,
}

/// ===== Listing (nft를 Option으로 저장: 꺼냈다 넣을 수 있게) =====
public struct Listing has key, store {
    id: UID,
    nft: Option<Toki>,
    owner: address,
    fee: u64,               // breed 대여료 (SUI)
    price: Option<u64>,     // 판매가 (없으면 판매 불가)
    gene_info: String,      // 표시용 캐시
    nonce: u64,             // breed 횟수
}

/// ===== Hot Potato 래퍼 (능력 없음: 반드시 소비/반납되어야 함) =====
public struct BorrowedToki {
    listing_id: ID,
    toki: Toki,
}

/// 모듈 초기화
fun init(ctx: &mut TxContext) {
    let farm = Farm { id: object::new(ctx), listings: table::new(ctx) };
    transfer::share_object(farm);
}

/// 리스트 등록
entry fun register(
    farm: &mut Farm,
    nft: Toki,
    fee: u64,
    price: Option<u64>,
    gene_info: String,
    ctx: &mut TxContext,
) {
    let nft_id = object::id(&nft);
    let listing = Listing {
        id: object::new(ctx),
        nft: option::some<Toki>(nft),
        owner: sender(ctx),
        fee,
        price,
        gene_info,
        nonce: 0,
    };
    table::add(&mut farm.listings, nft_id, listing);
}

/// 언리스트(주인만, NFT가 Listing 안에 반드시 있어야 함)
entry fun unlist(
    farm: &mut Farm,
    nft_id: ID,
    ctx: &mut TxContext
) {
    let me = sender(ctx);
    let l_im = table::borrow(&farm.listings, nft_id);
    assert!(me == l_im.owner, 0);
    assert!(option::is_some(&l_im.nft), 1); // 밖에 나가 있으면 언리스트 불가

    let listing = table::remove(&mut farm.listings, nft_id);
    let Listing { id, nft, owner, fee: _, price: _, gene_info: _, nonce: _ } = listing;
    let toki = option::extract(nft); // Some(Toki) -> Toki
    object::delete(id);
    transfer::public_transfer(toki, owner);
}

/// 구매(즉시매매): price가 Some이고, NFT가 Listing 안에 있을 때만 가능
/// - 플랫폼 수수료 1% 적용
entry fun buy(
    farm: &mut Farm,
    nft_id: ID,
    mut pay: Coin<SUI>,
    ctx: &mut TxContext
) {
    let buyer = sender(ctx);

    // 1) 읽기 전용 스코프: 판매 가능 + NFT 보관 중인지 확인
    let (owner, price_val) = {
        let l = table::borrow(&farm.listings, nft_id);
        assert!(option::is_some(&l.price), 2); // Not for sale
        assert!(option::is_some(&l.nft), 3);   // NFT must be present
        (l.owner, *option::borrow(&l.price))
    };

    // 2) 수수료 분배
    let platform_fee = price_val * PLATFORM_FEE_PPM / PPM_DENOM;
    let seller_gets  = price_val - platform_fee;

    pay::split_and_transfer(&mut pay, platform_fee, TREASURY, ctx);
    pay::split_and_transfer(&mut pay, seller_gets, owner, ctx);
    transfer::public_transfer(pay, buyer);

    // 3) Listing 제거 → NFT 추출 → 구매자에게 이전
    let listing_obj = table::remove(&mut farm.listings, nft_id);
    let Listing { id, nft, owner: _, fee: _, price: _, gene_info: _, nonce: _ } = listing_obj;
    let toki = option::extract(nft);
    object::delete(id);
    transfer::public_transfer(toki, buyer);
}

/// 부모 꺼내기(수수료 정산 + BorrowedToki 발급)
public fun take_parent(
    listing: &mut Listing,
    mut pay: Coin<SUI>,
    ctx: &mut TxContext
): BorrowedToki {
    assert!(option::is_some(&listing.nft), 10);

    // 대여료 정산 (오너는 0)
    let caller = sender(ctx);
    let fee_paid = if (caller == listing.owner) { 0 } else { listing.fee };
    if (fee_paid > 0) {
        let platform_fee = fee_paid * PLATFORM_FEE_PPM / PPM_DENOM;
        let owner_gets   = fee_paid - platform_fee;
        pay::split_and_transfer(&mut pay, platform_fee, TREASURY, ctx);
        pay::split_and_transfer(&mut pay, owner_gets, listing.owner, ctx);
    }
    // pay는 반드시 소비
    transfer::public_transfer(pay, caller);

    // NFT value 추출 → 래퍼에 담아 반환
    let toki = option::extract(&mut listing.nft);
    BorrowedToki { listing_id: object::id(listing), toki }
}

/// 반드시 반납(consume) — Listing 검증 + nonce++ + 원위치
public fun return_parent(
    listing: &mut Listing,
    borrowed: BorrowedToki
) {
    let BorrowedToki { listing_id, toki } = borrowed; // 여기서 consume
    assert!(object::id(listing) == listing_id, 20);

    listing.nonce = listing.nonce + 1;
    option::fill(&mut listing.nft, toki);
}

/// 두 Listing에서 Hot Potato로 꺼내고 → breed → 반드시 반납
entry fun pair_from_listings(
    farm: &mut Farm,
    id_a: ID, mut pay_a: Coin<SUI>,
    id_b: ID, mut pay_b: Coin<SUI>,
    ctx: &mut TxContext
) {
    // A 꺼내기 (스코프 분리로 &mut 충돌 회피)
    let borrowed_a = {
        let la = table::borrow_mut(&mut farm.listings, id_a);
        take_parent(la, pay_a, ctx)
    };

    // B 꺼내기
    let borrowed_b = {
        let lb = table::borrow_mut(&mut farm.listings, id_b);
        take_parent(lb, pay_b, ctx)
    };

    // breed는 &Toki만 필요 → 래퍼 안 value에 참조로 접근
    creature::breed(&borrowed_a.toki, &borrowed_b.toki, std::option::none<String>(), ctx);

    // 반드시 반납(consume)
    {
        let la = table::borrow_mut(&mut farm.listings, id_a);
        return_parent(la, borrowed_a);
    }
    {
        let lb = table::borrow_mut(&mut farm.listings, id_b);
        return_parent(lb, borrowed_b);
    }
}

/// A=Listing, B=Owned
entry fun pair_listing_owned(
    farm: &mut Farm,
    id_a: ID, mut pay_a: Coin<SUI>,
    b: &Toki,
    ctx: &mut TxContext
) {
    let borrowed_a = {
        let la = table::borrow_mut(&mut farm.listings, id_a);
        take_parent(la, pay_a, ctx)
    };

    creature::breed(&borrowed_a.toki, b, std::option::none<String>(), ctx);

    {
        let la = table::borrow_mut(&mut farm.listings, id_a);
        return_parent(la, borrowed_a);
    }
}

/// 둘 다 Owned
entry fun pair_owned_owned(
    a: &Toki,
    b: &Toki,
    ctx: &mut TxContext
) {
    creature::breed(a, b, std::option::none<String>(), ctx);
}
