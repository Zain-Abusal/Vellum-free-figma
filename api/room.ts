import { handle } from '../server/handlers';

export const config = { runtime: 'edge' };

export default function handler(req: Request) {
  return handle(req);
}
