import { betterAuth } from "better-auth";
import { LibsqlDialect } from "kysely-libsql";
import { authDbClient, ensureAuthUserPolicyColumns } from "@/lib/auth-db";
import { isBootstrapAdminEmail, isEmailAllowed } from "@/lib/auth-allowlist";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  database: {
    dialect: new LibsqlDialect({ client: authDbClient }),
    type: "sqlite",
  },
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
      },
      enabled: {
        type: "boolean",
        required: false,
        defaultValue: true,
      },
      allowed_branches: {
        type: "string",
        required: false,
        defaultValue: "[]",
      },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account",
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          await ensureAuthUserPolicyColumns();

          if (!await isEmailAllowed(user.email)) {
            throw new Error("This email is not allowed to access the system.");
          }

          const isAdmin = isBootstrapAdminEmail(user.email);

          return {
            data: {
              ...user,
              role: isAdmin ? "admin" : "user",
              enabled: true,
              allowed_branches: isAdmin ? '["*"]' : "[]",
            },
          };
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          await ensureAuthUserPolicyColumns();

          const user = await context?.context.internalAdapter.findUserById(session.userId);

          if (!await isEmailAllowed(user?.email)) {
            return false;
          }
        },
      },
    },
  },
});
