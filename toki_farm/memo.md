package id :0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178

farm id: 0x21e6647695577cbb73dbb5d31e50f1c0a21719be1b9033f3714fc74d5cd2ec5b

// 조상 mint
sui client call --package 0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178 --module creature --function mint_init --args

sui client call --package 0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178 --module creature --function mint_init --args 0 1 0  0 1 1  0 2 0  0 3 0  1 1 2 3 --gas-budget 100000000

sui client call --package 0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178 --module creature --function mint_init --args 1 1 0  0 0 1  1 3 0  1 2 0  1 0 1 2 --gas-budget 100000000

sui client call --package 0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178 --module creature --function mint_init --args 0 0 0  1 1 1  2 2 0  3 3 0  0 1 2 3 --gas-budget 100000000

sui client call --package 0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178 --module creature --function mint_init --args 0 1 0  1 0 1  0 1 0  2 0 0  0 1 0 0 --gas-budget 100000000

sui client call --package 0x2c736572e40614b1bd409d344a362eb6d724e77eefc7cc6517873e110c899178 --module creature --function 0x4697d6be20ff23961a91ab77581f6e6ce7c0b49a37bc010705d3a9da270844c5