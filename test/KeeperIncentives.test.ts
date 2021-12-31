import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { utils } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, waffle } from "hardhat";
import { DAYS, timeTravel } from "../lib/utils/test";
import {
  ContractRegistry,
  KeeperIncentive,
  KeeperIncentiveHelper,
  MockERC20,
  PopLocker,
  RewardsEscrow,
} from "../typechain";

let deployTimestamp,
  owner: SignerWithAddress,
  nonOwner: SignerWithAddress,
  mockPop: MockERC20,
  contractRegistry: ContractRegistry,
  keeperIncentive: KeeperIncentive,
  keeperIncentiveHelper: KeeperIncentiveHelper,
  rewardsEscrow: RewardsEscrow,
  staking: PopLocker;
const incentive = parseEther("10");

describe("Keeper incentives", function () {
  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();
    const mockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockPop = (await (
      await mockERC20Factory.deploy("TestPOP", "TPOP", 18)
    ).deployed()) as MockERC20;
    await mockPop.mint(owner.address, parseEther("2100"));
    await mockPop.mint(nonOwner.address, parseEther("10"));
    const popLockerFactory = await ethers.getContractFactory("PopLocker");
    rewardsEscrow = (await (
      await (
        await ethers.getContractFactory("RewardsEscrow")
      ).deploy(mockPop.address)
    ).deployed()) as RewardsEscrow;

    const aclRegistry = await (
      await (await ethers.getContractFactory("ACLRegistry")).deploy()
    ).deployed();

    contractRegistry = await (
      await (
        await ethers.getContractFactory("ContractRegistry")
      ).deploy(aclRegistry.address)
    ).deployed();

    keeperIncentive = await (
      await (
        await ethers.getContractFactory("KeeperIncentive")
      ).deploy(contractRegistry.address, parseEther("0.25"), parseEther("2000"))
    ).deployed();

    staking = (await popLockerFactory.deploy(
      mockPop.address,
      rewardsEscrow.address
    )) as PopLocker;
    await staking.deployed();

    deployTimestamp = (await waffle.provider.getBlock("latest")).timestamp + 1;
    keeperIncentiveHelper = await (
      await (
        await ethers.getContractFactory("KeeperIncentiveHelper")
      ).deploy(keeperIncentive.address)
    ).deployed();

    await aclRegistry
      .connect(owner)
      .grantRole(ethers.utils.id("DAO"), owner.address);
    await aclRegistry
      .connect(owner)
      .grantRole(ethers.utils.id("Keeper"), owner.address);

    await contractRegistry
      .connect(owner)
      .addContract(
        ethers.utils.id("POP"),
        mockPop.address,
        ethers.utils.id("1")
      );
    await contractRegistry
      .connect(owner)
      .addContract(
        ethers.utils.id("PopLocker"),
        staking.address,
        ethers.utils.id("1")
      );

    await keeperIncentive
      .connect(owner)
      .createIncentive(
        utils.formatBytes32String("KeeperIncentiveHelper"),
        incentive,
        true,
        false
      );

    await keeperIncentive
      .connect(owner)
      .addControllerContract(
        utils.formatBytes32String("KeeperIncentiveHelper"),
        keeperIncentiveHelper.address
      );
    await keeperIncentive
      .connect(owner)
      .createIncentive(
        utils.formatBytes32String("KeeperIncentiveHelper"),
        incentive,
        true,
        false
      );
    await mockPop
      .connect(owner)
      .approve(keeperIncentive.address, parseEther("100000"));
    await mockPop
      .connect(owner)
      .approve(keeperIncentiveHelper.address, parseEther("100000"));
    await mockPop.connect(owner).approve(staking.address, parseEther("100000"));
    await staking.connect(owner).lock(owner.address, parseEther("2000"), 0);
    await timeTravel(7 * DAYS);
  });
  it("functions should only be available for Governance", async function () {
    await expect(
      keeperIncentive
        .connect(nonOwner)
        .createIncentive(
          utils.formatBytes32String("KeeperIncentiveHelper"),
          incentive,
          true,
          false
        )
    ).to.be.revertedWith("you dont have the right role");
    await expect(
      keeperIncentive
        .connect(nonOwner)
        .updateIncentive(
          utils.formatBytes32String("KeeperIncentiveHelper"),
          0,
          incentive,
          true,
          false
        )
    ).to.be.revertedWith("you dont have the right role");
    await expect(
      keeperIncentive
        .connect(nonOwner)
        .toggleApproval(utils.formatBytes32String("KeeperIncentiveHelper"), 0)
    ).to.be.revertedWith("you dont have the right role");
    await expect(
      keeperIncentive
        .connect(nonOwner)
        .toggleIncentive(utils.formatBytes32String("KeeperIncentiveHelper"), 0)
    ).to.be.revertedWith("you dont have the right role");
  });
  it("should adjust the burn rate", async function () {
    expect(
      await keeperIncentive.connect(owner).updateBurnRate(parseEther("0.1"))
    )
      .to.emit(keeperIncentive, "BurnRateChanged")
      .withArgs(parseEther("0.25"), parseEther("0.1"));
    expect(await keeperIncentive.burnRate()).to.be.equal(parseEther("0.1"));
  });
  it("should adjust the required keeper stake", async function () {
    expect(
      await keeperIncentive
        .connect(owner)
        .updateRequiredKeeperStake(parseEther("100"))
    )
      .to.emit(keeperIncentive, "RequiredKeeperStakeChanged")
      .withArgs(parseEther("2000"), parseEther("100"));
    expect(await keeperIncentive.requiredKeeperStake()).to.be.equal(
      parseEther("100")
    );
  });
  it("should create an incentive", async () => {
    const result = await keeperIncentive
      .connect(owner)
      .createIncentive(
        utils.formatBytes32String("KeeperIncentiveHelper"),
        incentive,
        true,
        false
      );
    expect(result)
      .to.emit(keeperIncentive, "IncentiveCreated")
      .withArgs(
        utils.formatBytes32String("KeeperIncentiveHelper"),
        incentive,
        false
      );
    expect(
      await keeperIncentive.incentives(
        utils.formatBytes32String("KeeperIncentiveHelper"),
        0
      )
    ).to.deep.equal([incentive, true, false]);
  });
  describe("change incentives", function () {
    it("should change the whole incentive", async function () {
      await keeperIncentive
        .connect(owner)
        .createIncentive(
          utils.formatBytes32String("KeeperIncentiveHelper"),
          incentive,
          true,
          false
        );
      const result = await keeperIncentive
        .connect(owner)
        .updateIncentive(
          utils.formatBytes32String("KeeperIncentiveHelper"),
          0,
          parseEther("100"),
          false,
          true
        );
      expect(result)
        .to.emit(keeperIncentive, "IncentiveChanged")
        .withArgs(
          utils.formatBytes32String("KeeperIncentiveHelper"),
          incentive,
          parseEther("100"),
          false,
          true
        );
      expect(
        await keeperIncentive.incentives(
          utils.formatBytes32String("KeeperIncentiveHelper"),
          0
        )
      ).to.deep.equal([parseEther("100"), false, true]);
    });
    it("should toggle if the incentive is enabled", async function () {
      const result = await keeperIncentive
        .connect(owner)
        .toggleIncentive(utils.formatBytes32String("KeeperIncentiveHelper"), 0);
      expect(result)
        .to.emit(keeperIncentive, "IncentiveToggled")
        .withArgs(utils.formatBytes32String("KeeperIncentiveHelper"), false);
      expect(
        await keeperIncentive.incentives(
          utils.formatBytes32String("KeeperIncentiveHelper"),
          0
        )
      ).to.deep.equal([incentive, false, false]);
      const result2 = await keeperIncentive
        .connect(owner)
        .toggleIncentive(utils.formatBytes32String("KeeperIncentiveHelper"), 0);
      expect(result2)
        .to.emit(keeperIncentive, "IncentiveToggled")
        .withArgs(utils.formatBytes32String("KeeperIncentiveHelper"), true);
      expect(
        await keeperIncentive.incentives(
          utils.formatBytes32String("KeeperIncentiveHelper"),
          0
        )
      ).to.deep.equal([incentive, true, false]);
    });
    it("should fund incentives", async function () {
      await mockPop
        .connect(nonOwner)
        .approve(keeperIncentive.address, incentive);
      const result = await keeperIncentive
        .connect(nonOwner)
        .fundIncentive(incentive);
      expect(result)
        .to.emit(keeperIncentive, "IncentiveFunded")
        .withArgs(incentive);
      expect(await mockPop.balanceOf(keeperIncentive.address)).to.equal(
        incentive
      );
      expect(await keeperIncentive.incentiveBudget()).to.equal(incentive);
    });
    context("approval", function () {
      it("should toggle approval", async function () {
        expect(
          await keeperIncentive
            .connect(owner)
            .toggleApproval(
              utils.formatBytes32String("KeeperIncentiveHelper"),
              0
            )
        )
          .to.emit(keeperIncentive, "ApprovalToggled")
          .withArgs(utils.formatBytes32String("KeeperIncentiveHelper"), true);
        expect(
          await keeperIncentive.incentives(
            utils.formatBytes32String("KeeperIncentiveHelper"),
            0
          )
        ).to.deep.equal([incentive, true, true]);
        expect(
          await keeperIncentive
            .connect(owner)
            .toggleApproval(
              utils.formatBytes32String("KeeperIncentiveHelper"),
              0
            )
        )
          .to.emit(keeperIncentive, "ApprovalToggled")
          .withArgs(utils.formatBytes32String("KeeperIncentiveHelper"), false);
        expect(
          await keeperIncentive.incentives(
            utils.formatBytes32String("KeeperIncentiveHelper"),
            0
          )
        ).to.deep.equal([incentive, true, false]);
      });
    });
  });
  describe("call incentivized functions", function () {
    it("should pay out keeper incentive rewards", async function () {
      const oldBalance = await mockPop.balanceOf(owner.address);
      await mockPop
        .connect(nonOwner)
        .approve(keeperIncentive.address, incentive);
      await keeperIncentive.connect(nonOwner).fundIncentive(incentive);

      expect(await keeperIncentiveHelper.connect(owner).incentivisedFunction())
        .to.emit(keeperIncentiveHelper, "FunctionCalled")
        .withArgs(owner.address);
      const newBalance = await mockPop.balanceOf(owner.address);
      expect(newBalance).to.deep.equal(oldBalance.add(incentive.mul(3).div(4)));
    });
    it("should not pay out rewards if the incentive budget is not high enough", async function () {
      const oldBalance = await mockPop.balanceOf(owner.address);
      await keeperIncentiveHelper.connect(owner).incentivisedFunction();
      const newBalance = await mockPop.balanceOf(owner.address);
      expect(newBalance).to.equal(oldBalance);
    });
    it("should revert if the keeper didnt stake enough pop", async function () {
      await keeperIncentive
        .connect(owner)
        .updateRequiredKeeperStake(parseEther("3000"));
      await expect(
        keeperIncentiveHelper.connect(owner).incentivisedFunction()
      ).to.be.revertedWith("not enough pop at stake");
    });
    context("approval", function () {
      it("should not be callable for non approved addresses", async function () {
        await expect(
          keeperIncentiveHelper.connect(nonOwner).incentivisedFunction()
        ).to.revertedWith("you dont have the right role");
      });
      it("should be callable for non approved addresses if the incentive is open to everyone", async function () {
        await keeperIncentive
          .connect(owner)
          .toggleApproval(
            utils.formatBytes32String("KeeperIncentiveHelper"),
            0
          );
        await mockPop
          .connect(owner)
          .approve(keeperIncentiveHelper.address, parseEther("11"));
        await keeperIncentive.connect(owner).fundIncentive(parseEther("11"));

        const oldBalance = await mockPop.balanceOf(nonOwner.address);
        const result = await keeperIncentiveHelper
          .connect(nonOwner)
          .incentivisedFunction();

        expect(result)
          .to.emit(keeperIncentiveHelper, "FunctionCalled")
          .withArgs(nonOwner.address);
        const newbalance = await mockPop.balanceOf(nonOwner.address);
        expect(newbalance).to.equal(oldBalance.add(incentive.mul(3).div(4)));
      });
    });
    context("should not do anything ", function () {
      it("if the incentive for this function wasnt set yet", async function () {
        keeperIncentive = await (
          await (
            await ethers.getContractFactory("KeeperIncentive")
          ).deploy(
            contractRegistry.address,
            parseEther("0.25"),
            parseEther("2000")
          )
        ).deployed();
        await keeperIncentive
          .connect(owner)
          .addControllerContract(
            utils.formatBytes32String("KeeperIncentiveHelper"),
            keeperIncentiveHelper.address
          );
        await mockPop
          .connect(nonOwner)
          .approve(keeperIncentive.address, incentive);
        await keeperIncentive.connect(nonOwner).fundIncentive(incentive);

        const oldBalance = await mockPop.balanceOf(owner.address);
        expect(
          await keeperIncentiveHelper.connect(owner).incentivisedFunction()
        )
          .to.emit(keeperIncentiveHelper, "FunctionCalled")
          .withArgs(owner.address);

        const newBalance = await mockPop.balanceOf(owner.address);
        expect(newBalance).to.equal(oldBalance);
      });
    });
  });
});
