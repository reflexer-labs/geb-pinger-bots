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
            0xFbF4849a06F6e6F53EcB31D2f8BD61aA7874b268,
            0x7Acfc14dBF2decD1c9213Db32AE7784626daEb48
        );

        hevm = Hevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
        hevm.warp(now + 3600 * 24);
    }

    function test_osm_and_oracle_relayer() public {
        bundler.updateOsmAndEthAOracleRelayer();
    }

    function test_coin_meidan_and_rate_setter() public {
        bundler.updateCoinMedianizerAndRateSetter(address(this));
    }
}
