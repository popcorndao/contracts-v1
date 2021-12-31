import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  expectEvent,
  expectNoEvent,
  expectRevert,
} from "../lib/utils/expectValue";
import { ACLRegistry } from "../typechain";
import { ACLRegistryHelper } from "../typechain/ACLRegistryHelper";

const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ROLE = ethers.utils.id("ROLE");
const OTHER_ROLE = ethers.utils.id("OTHER_ROLE");
const PERMISSION = ethers.utils.id("PERMISSION");

let admin: SignerWithAddress,
  authorized: SignerWithAddress,
  other: SignerWithAddress,
  otherAdmin: SignerWithAddress;

let aclRegistry: ACLRegistry;
let aclRegistryHelper: ACLRegistryHelper;

describe("ACLRegistry", () => {
  beforeEach(async () => {
    [admin, authorized, other, otherAdmin] = await ethers.getSigners();
    aclRegistry = (await (
      await ethers.getContractFactory("ACLRegistry")
    ).deploy()) as unknown as ACLRegistry;
    aclRegistry.deployed();
    aclRegistryHelper = await (
      await ethers.getContractFactory("ACLRegistryHelper")
    ).deploy(aclRegistry.address);
    aclRegistryHelper.deployed();
  });
  describe("default admin", function () {
    it("deployer has default admin role", async function () {
      expect(
        await aclRegistry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)
      ).to.equal(true);
    });

    it("other roles's admin is the default admin role", async function () {
      expect(await aclRegistry.getRoleAdmin(ROLE)).to.equal(DEFAULT_ADMIN_ROLE);
    });

    it("default admin role's admin is itself", async function () {
      expect(await aclRegistry.getRoleAdmin(DEFAULT_ADMIN_ROLE)).to.equal(
        DEFAULT_ADMIN_ROLE
      );
    });
  });

  describe("granting", function () {
    beforeEach(async function () {
      await aclRegistry.connect(admin).grantRole(ROLE, authorized.address);
    });

    it("non-admin cannot grant role to other accounts", async function () {
      await expectRevert(
        aclRegistry.connect(other).grantRole(ROLE, authorized.address),
        `you dont have the required role`
      );
    });

    it("accounts can be granted a role multiple times", async function () {
      await aclRegistry.connect(admin).grantRole(ROLE, authorized.address);
      const receipt = await aclRegistry
        .connect(admin)
        .grantRole(ROLE, authorized.address);
      await await expectNoEvent(receipt, aclRegistry, "RoleGranted");
    });
  });

  describe("revoking", function () {
    it("roles that are not had can be revoked", async function () {
      expect(await aclRegistry.hasRole(ROLE, authorized.address)).to.equal(
        false
      );

      const receipt = await aclRegistry
        .connect(admin)
        .revokeRole(ROLE, authorized.address);
      await expectNoEvent(receipt, aclRegistry, "RoleRevoked");
    });

    context("with granted role", function () {
      beforeEach(async function () {
        await aclRegistry.connect(admin).grantRole(ROLE, authorized.address);
      });

      it("admin can revoke role", async function () {
        const receipt = await aclRegistry
          .connect(admin)
          .revokeRole(ROLE, authorized.address);
        await expectEvent(receipt, aclRegistry, "RoleRevoked", [
          ROLE,
          authorized.address,
          admin.address,
        ]);

        expect(await aclRegistry.hasRole(ROLE, authorized.address)).to.equal(
          false
        );
      });

      it("non-admin cannot revoke role", async function () {
        await expectRevert(
          aclRegistry.connect(other).revokeRole(ROLE, authorized.address),
          `you dont have the required role`
        );
      });

      it("a role can be revoked multiple times", async function () {
        await aclRegistry.connect(admin).revokeRole(ROLE, authorized.address);

        const receipt = await aclRegistry
          .connect(admin)
          .revokeRole(ROLE, authorized.address);
        await expectNoEvent(receipt, aclRegistry, "RoleRevoked");
      });
    });
  });

  describe("renouncing", function () {
    it("roles that are not had can be renounced", async function () {
      const receipt = await aclRegistry.renounceRole(ROLE, authorized.address);
      await expectNoEvent(receipt, aclRegistry, "RoleRevoked");
    });

    context("with granted role", function () {
      beforeEach(async function () {
        await aclRegistry.connect(admin).grantRole(ROLE, authorized.address);
      });

      it("bearer can renounce role", async function () {
        const receipt = await aclRegistry
          .connect(authorized)
          .renounceRole(ROLE, authorized.address);
        await expectEvent(receipt, aclRegistry, "RoleRevoked", [
          ROLE,
          authorized.address,
          authorized.address,
        ]);

        expect(await aclRegistry.hasRole(ROLE, authorized.address)).to.equal(
          false
        );
      });

      it("only the sender or admin can renounce roles of a user", async function () {
        await expectRevert(
          aclRegistry.connect(other).renounceRole(ROLE, authorized.address),
          `you cant renounce this role`
        );
      });

      it("a role can be renounced multiple times", async function () {
        await aclRegistry
          .connect(authorized)
          .renounceRole(ROLE, authorized.address);

        const receipt = await aclRegistry
          .connect(authorized)
          .renounceRole(ROLE, authorized.address);
        await expectNoEvent(receipt, aclRegistry, "RoleRevoked");
      });
    });
  });

  describe("setting role admin", function () {
    beforeEach(async function () {
      const receipt = await aclRegistry.setRoleAdmin(ROLE, OTHER_ROLE);
      await expectEvent(receipt, aclRegistry, "RoleAdminChanged", [
        ROLE,
        DEFAULT_ADMIN_ROLE,
        OTHER_ROLE,
      ]);

      await aclRegistry
        .connect(admin)
        .grantRole(OTHER_ROLE, otherAdmin.address);
    });

    it("a role's admin role can be changed", async function () {
      expect(await aclRegistry.getRoleAdmin(ROLE)).to.equal(OTHER_ROLE);
    });

    it("the new admin can grant roles", async function () {
      const receipt = await aclRegistry
        .connect(otherAdmin)
        .grantRole(ROLE, authorized.address);
      await expectEvent(receipt, aclRegistry, "RoleGranted", [
        ROLE,
        authorized.address,
        otherAdmin.address,
      ]);
    });

    it("the new admin can revoke roles", async function () {
      await aclRegistry.connect(otherAdmin).grantRole(ROLE, authorized.address);
      const receipt = await aclRegistry
        .connect(otherAdmin)
        .revokeRole(ROLE, authorized.address);
      await expectEvent(receipt, aclRegistry, "RoleRevoked", [
        ROLE,
        authorized.address,
        otherAdmin.address,
      ]);
    });

    it("a role's previous admins no longer grant roles", async function () {
      await expectRevert(
        aclRegistry.connect(admin).grantRole(ROLE, authorized.address),
        `you dont have the required role`
      );
    });

    it("a role's previous admins no longer revoke roles", async function () {
      await expectRevert(
        aclRegistry.connect(admin).revokeRole(ROLE, authorized.address),
        `you dont have the required role`
      );
    });
  });

  describe("permissions", function () {
    context("grant permission", () => {
      it("admin can set permission", async function () {
        await aclRegistry
          .connect(admin)
          .grantPermission(PERMISSION, authorized.address);
      });

      it("revert if sender is not admin", async function () {
        await expectRevert(
          aclRegistry
            .connect(other)
            .grantPermission(PERMISSION, authorized.address),
          `only for admin`
        );
      });

      it("admin can overwrite permission", async function () {
        await aclRegistry
          .connect(admin)
          .grantPermission(PERMISSION, authorized.address);
      });
    });
    context("revoke permission", () => {
      it("admin can delete permission", async function () {
        await aclRegistry.connect(admin).revokePermission(PERMISSION);
      });

      it("revert if sender is not admin", async function () {
        await expectRevert(
          aclRegistry.connect(other).revokePermission(PERMISSION),
          `only for admin`
        );
      });
    });
  });

  describe("onlyRole modifier", function () {
    beforeEach(async function () {
      await aclRegistry.connect(admin).grantRole(ROLE, authorized.address);
    });

    it("do not revert if sender has role", async function () {
      await aclRegistryHelper.connect(authorized).senderProtected(ROLE);
    });

    it("revert if sender doesn't have role #1", async function () {
      await expectRevert(
        aclRegistryHelper.connect(other).senderProtected(ROLE),
        `you dont have the required role`
      );
    });

    it("revert if sender doesn't have role #2", async function () {
      await expectRevert(
        aclRegistryHelper.connect(authorized).senderProtected(OTHER_ROLE),
        `you dont have the required role`
      );
    });
  });
});
