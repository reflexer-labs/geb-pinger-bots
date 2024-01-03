pragma solidity ^0.6.7;

import "ds-test/test.sol";

import "./PingerBundledCall.sol";

interface Hevm {
    function warp(uint256) external;
}   

contract PingerBundledCallTest is DSTest {
    Hevm hevm;
    PingerBundledCall bundler;

    function setUp() public {
        bundler = new PingerBundledCall(
            0xD4A0E3EC2A937E7CCa4A192756a8439A8BF4bA91,
            0x4ed9C0dCa0479bC64d8f4EB3007126D5791f7851,
            0x345000502A9b6c0536C4b1930F1ed75412984AEA,
            0x7Acfc14dBF2decD1c9213Db32AE7784626daEb48,
            address(this),
            0x0A5653CCa4DB1B6E265F47CAf6969e64f1CFdC45,
            0xCC88a9d330da1133Df3A7bD823B95e52511A6962
        );

        hevm = Hevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
        hevm.warp(now + 3600 * 24);
    }

    function test_osm_and_oracle_relayer() public {
        bundler.updateOsmAndEthAOracleRelayer();

        bundler.withdrawPayout(address(this), SafeEngine(0xCC88a9d330da1133Df3A7bD823B95e52511A6962).coinBalance(address(bundler)) / 1e27);
    }

    function test_coin_meidan_and_rate_setter() public {
        bundler.updateCoinMedianizerAndRateSetter(address(this));
    }
}
