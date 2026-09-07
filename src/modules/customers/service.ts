import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { normalizePhoneToE164 } from "@/domain/phone";
import { customersRepository } from "@/modules/customers/repository";
import { requestOtp, verifyOtp } from "@/modules/customers/otp";
import { notificationsService } from "@/modules/notifications";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — exact duration is an open UX/business question (technical-architecture.md §7); this is a safe, revisable default.

export type AddressInput = {
  label?: string;
  recipientName: string;
  phoneE164: string;
  governorate: string;
  city: string;
  area?: string;
  street: string;
  building?: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  notes?: string;
};

/** Public interface — module-boundaries.md's Customers row (requestOtp/verifyOtp/getSession/getProfile/listAddresses), Authentication as a sub-domain. */
export const customersService = {
  async createGuestSession() {
    const token = randomBytes(32).toString("hex");
    return customersRepository.createSession({
      customerId: null,
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
  },

  async getSession(token: string) {
    const session = await customersRepository.findSessionByToken(token);
    if (!session || session.expiresAt < new Date()) return null;
    return session;
  },

  /**
   * ADR-006: website owns identity — OTP delivery goes through the
   * Notifications abstraction, never a provider SDK called directly here.
   * `devCode` is populated ONLY outside production: with no real SMS
   * provider wired (this phase's brief), this is how the flow is
   * completable at all in development — never via the logger, which
   * technical-architecture.md §21 forbids for OTP codes unconditionally.
   * See LogNotificationProvider's comment for the full reasoning.
   */
  async requestPhoneVerification(rawPhone: string) {
    const phoneE164 = normalizePhoneToE164(rawPhone);
    const { code, expiresAt } = await requestOtp(phoneE164);
    await notificationsService.notify("otp_code", phoneE164);
    return { expiresAt, devCode: process.env.NODE_ENV === "production" ? undefined : code };
  },

  /**
   * Verifies the code and either attaches an existing/new Customer to the
   * given session (technical-architecture.md §7: guest→account converts
   * the session in place, no separate merge step for this specific case).
   */
  async verifyPhoneAndAuthenticate(sessionToken: string, rawPhone: string, code: string) {
    const phoneE164 = normalizePhoneToE164(rawPhone);
    await verifyOtp(phoneE164, code);

    const session = await customersRepository.findSessionByToken(sessionToken);
    if (!session) throw new Error("Session not found");

    let customer = await customersRepository.findCustomerByPhone(phoneE164);
    if (!customer) {
      customer = await customersRepository.createCustomer(phoneE164);
    }

    await customersRepository.attachCustomerToSession(session.id, customer.id);
    return customer;
  },

  async listAddresses(customerId: string) {
    return customersRepository.listAddressesForCustomer(customerId);
  },

  async createAddress(customerId: string, input: AddressInput) {
    const phoneE164 = normalizePhoneToE164(input.phoneE164);
    const makeDefault = (await customersRepository.listAddressesForCustomer(customerId)).length === 0;

    return db.address.create({
      data: { ...input, phoneE164, customerId, isDefault: makeDefault },
    });
  },

  /** Unset-then-set inside one transaction — see commerce-completeness-audit.md §8 on why this isn't (yet) a DB-level constraint. */
  async setDefaultAddress(customerId: string, addressId: string) {
    return db.$transaction(async (tx) => {
      const address = await tx.address.findUnique({ where: { id: addressId } });
      if (!address || address.customerId !== customerId) {
        throw new Error("Address not found for this customer");
      }
      await tx.address.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });
  },

  async deleteAddress(customerId: string, addressId: string) {
    const address = await customersRepository.findAddressById(addressId);
    if (!address || address.customerId !== customerId) {
      throw new Error("Address not found for this customer");
    }
    await customersRepository.deleteAddress(addressId);
  },
};
