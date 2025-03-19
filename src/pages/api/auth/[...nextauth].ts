
import NextAuth from 'next-auth';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '../../../lib/prisma'; // Use the properly configured client
import EmailProvider from 'next-auth/providers/email';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: process.env.EMAIL_SERVER_PORT,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        
        // Add user subscription info to session
        const user = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { 
            role: true, 
            subscriptionId: true,
            usageLimit: true 
          },
        });
        
        if (user) {
          session.user.role = user.role;
          session.user.subscriptionId = user.subscriptionId;
          session.user.usageLimit = user.usageLimit;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

export default NextAuth(authOptions);