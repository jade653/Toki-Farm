module toki_farm::farm;

use std::string::{String};
use std::option::{Self, Option};
use sui::tx_context::{sender};
use sui::coin::{Coin, split};
use sui::sui::SUI;
use sui::table::{Self, Table};
use sui::transfer;
use sui::object::{Self, ID, UID};
use sui::pay;

use toki_farm::creature::{Self, Toki};

/// ===== Constants=====
const TREASURY: address = @0x7eb454f344351e89e49e40b40f139c3c5bb96affda0653689a332cb64c00c157;               
const PLATFORM_FEE_PPM: u64 = 10_000;               // 1% = 10,000 / 1,000,000
const PPM_DENOM: u64 = 1_000_000;

/// ===== Farm (Shared Object) =====
public struct Farm has key {
    id: UID,
    listings: Table<ID, Listing>
}

/// ===== Listing 래퍼 =====
public struct Listing has key, store {
    id: UID,
    nft: Toki,
    owner: address,
    fee: u64,               // breed 대여료 (SUI)
    price: Option<u64>,     // 판매가 (없으면 판매 불가)
    gene_info: String,      // 표시용 캐시
    nonce: u64,             // breed 횟수 (대여 시마다 증가, 중복 사용 방지용)
}

/// 모듈 초기화 시 Farm 공유 객체 생성
fun init(ctx: &mut TxContext) {
    let farm = Farm {
        id: object::new(ctx),
        listings: table::new(ctx)
    };
    transfer::share_object(farm);
}

/// 리스트: NFT를 래핑하여 Listing 생성
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
        nft,
        owner: sender(ctx),
        fee,
        price,
        gene_info,
        nonce: 0,
    };
    table::add(&mut farm.listings, nft_id, listing);
}

/// 언리스트: 주인만 가능(비용 없음)
entry fun unlist(
    farm: &mut Farm,
    nft_id: ID,
    ctx: &mut TxContext
) {
    let me = sender(ctx);
    let listing = table::borrow(&farm.listings, nft_id);
    assert!(me == listing.owner, 0);

    let listing = table::remove(&mut farm.listings, nft_id);
    let Listing { id, nft, owner, fee: _, price: _, gene_info: _, nonce: _ } = listing;
    object::delete(id);
    transfer::public_transfer(nft, owner);
}

/// 구매(즉시매매): price가 Some일 때만 가능
/// - 플랫폼 수수료 1% 적용: platform = price * PPM / DENOM (정수 내림)
entry fun buy(
    farm: &mut Farm,
    nft_id: ID,
    mut pay: Coin<SUI>,
    ctx: &mut TxContext
) {
    let buyer = sender(ctx);
    
    // 1. 먼저 Listing 정보를 읽어옵니다. (Immutable Borrow)
    //    - 중첩된 borrow를 피하기 위해 별도 scope로 묶습니다.
    let (owner, price_val) = {
        let listing = table::borrow(&farm.listings, nft_id);
        let price_opt = &listing.price;
        assert!(option::is_some(price_opt), 1); // ENotForSale
        (listing.owner, *option::borrow(price_opt))
    };

    // 2. fee 정산
    let platform_fee = price_val * PLATFORM_FEE_PPM / PPM_DENOM;
    let seller_gets = price_val - platform_fee;

    // 플랫폼 수수료 이전
    pay::split_and_transfer(&mut pay, platform_fee, TREASURY, ctx);
    // 판매자에게 판매대금 이전
    pay::split_and_transfer(&mut pay, seller_gets, owner, ctx);
    // 남은 금액(잔돈)은 구매자에게 반환
    transfer::public_transfer(pay, buyer);

    // 3. Listing을 제거하고 NFT를 구매자에게 이전합니다. (Mutable Borrow)
    let listing_obj = table::remove(&mut farm.listings, nft_id);
    let Listing { id, nft, owner: _, fee: _, price: _, gene_info: _, nonce: _ } = listing_obj;
    object::delete(id);
    transfer::public_transfer(nft, buyer);
}

/// 내부: Listing에서 부모 참조 빌리기 + 요금 정산(플랫폼/오너) + nonce 증가
/// 부모 NFT를 임시로 빌립니다 (수수료 정산 포함)
public fun borrow_listing_parent(
    listing: &mut Listing,
    mut pay: Coin<SUI>,
    ctx: &mut TxContext
): &Toki {
    let caller = sender(ctx);
    let parent = &listing.nft;
    if (caller != listing.owner && listing.fee > 0) {
        let platform_fee = listing.fee * PLATFORM_FEE_PPM / PPM_DENOM;
        let owner_gets = listing.fee - platform_fee;

        pay::split_and_transfer(&mut pay, platform_fee, TREASURY, ctx);
        pay::split_and_transfer(&mut pay, owner_gets, listing.owner, ctx);
        transfer::public_transfer(pay, caller);
    } else {
        transfer::public_transfer(pay, caller);
    }

    parent
}

entry fun pair_from_listings(
    farm: &mut Farm,
    id_a: ID, mut pay_a: Coin<SUI>,
    id_b: ID, mut pay_b: Coin<SUI>,
    ctx: &mut TxContext
) {
    // 1) 두 listing을 테이블에서 "꺼내온다" (소유권 이동)
    let mut listing_a = table::remove(&mut farm.listings, id_a);
    let mut listing_b = table::remove(&mut farm.listings, id_b);

    let pa = borrow_listing_parent(listing_a, pay_a, ctx);
    let pb = borrow_listing_parent(listing_b, pay_b, ctx);

    creature::breed(pa, pb, std::option::none<String>(), ctx);

    // 4) nonce 증가
    listing_a.nonce = listing_a.nonce + 1;
    listing_b.nonce = listing_b.nonce + 1;

    // 5) 다시 테이블에 넣어준다 (원래 키로)
    let key_a = object::id(&listing_a.nft);
    let key_b = object::id(&listing_b.nft);
    table::add(&mut farm.listings, key_a, listing_a);
    table::add(&mut farm.listings, key_b, listing_b);
}

/// (1) 두 부모 모두 Listing
// entry fun pair_from_listingss(
//     farm: &mut Farm,
//     id_a: ID, pay_a: Coin<SUI>,
//     id_b: ID, pay_b: Coin<SUI>,
//     ctx: &mut TxContext
// ) {
//     let a_listing = table::borrow_mut(&mut farm.listings, id_a);
//     let b_listing = table::borrow_mut(&mut farm.listings, id_b);

//     let pa = borrow_listing_parent(a_listing, pay_a, ctx);
//     let pb = borrow_listing_parent(b_listing, pay_b, ctx);

//     creature::breed(pa, pb, std::option::none<String>(), ctx);
// }

/// (2) A=Listing, B=Owned
entry fun pair_listing_owned(
    farm: &mut Farm,
    id_a: ID, pay_a: Coin<SUI>,
    b: &Toki,
    ctx: &mut TxContext
) {
    let a_listing = table::borrow_mut(&mut farm.listings, id_a);
   let pa = borrow_listing_parent(a_listing, pay_a, ctx);
    creature::breed(pa, b, std::option::none<String>(), ctx);
}

/// (3) 둘 다 Owned
entry fun pair_owned_owned(
    a: &Toki,
    b: &Toki,
    ctx: &mut TxContext
) {
    creature::breed(a, b, std::option::none<String>(), ctx);
}
