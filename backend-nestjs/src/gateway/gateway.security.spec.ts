jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {} }));

import { AppGateway } from './app.gateway';

describe('WebSocket Gateway Security (AUD-010, AUD-012, AUD-024)', () => {
  let gateway: AppGateway;

  const mockTokenService = {
    authenticateAccessToken: jest.fn(),
  };

  const mockContestRepo = {
    findOne: jest.fn(),
  };

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new AppGateway(
      mockTokenService as never,
      mockContestRepo as never,
    );
    gateway.server = mockServer as never;
  });

  const createMockSocket = (authData: any = {}) => {
    const socket = {
      id: 'socket-client-1',
      handshake: {
        auth: authData.auth || {},
        headers: authData.headers || {},
      },
      data: {} as Record<string, any>,
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      to: jest.fn().mockReturnThis(),
    };
    return socket;
  };

  it('publishes headless worker notifications to the API relay', async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const workerGateway = new AppGateway(mockTokenService as never, mockContestRepo as never,
      { publish } as never);
    workerGateway.emitToUser('student-1', 'submission_completed', { status: 'accepted' });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toBe('codeskill:ws:events');
    expect(JSON.parse(publish.mock.calls[0][1])).toMatchObject({
      target: 'user',
      targetId: 'student-1',
      event: 'submission_completed',
      data: { status: 'accepted' },
    });
  });

  describe('handleConnection authentication (AUD-010)', () => {
    it('disconnects sockets that provide no authentication token', async () => {
      const socket = createMockSocket({});

      await gateway.handleConnection(socket as never);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Authentication required',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('disconnects sockets with invalid or expired access token', async () => {
      const socket = createMockSocket({
        auth: { token: 'invalid.jwt.token' },
      });
      mockTokenService.authenticateAccessToken.mockResolvedValue(null);

      await gateway.handleConnection(socket as never);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid or expired token',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('authenticates valid token, sets client.data, and joins private user room', async () => {
      const validUser = {
        id: 'user-uuid-1',
        email: 'student@cu.edu',
        role: 'student',
        isAdmin: false,
      };

      const socket = createMockSocket({
        headers: { authorization: 'Bearer valid.jwt.token' },
      });
      mockTokenService.authenticateAccessToken.mockResolvedValue(validUser);

      await gateway.handleConnection(socket as never);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.data.user).toEqual(validUser);
      expect(socket.data.userId).toBe('user-uuid-1');
      expect(socket.join).toHaveBeenCalledWith('user_user-uuid-1');
    });
  });

  describe('handleJoinContest authorization (AUD-024)', () => {
    const contestId = 'contest-123';
    const candidateId = 'candidate-uuid-1';

    it('rejects candidate not registered for the contest', async () => {
      const socket = createMockSocket();
      socket.data = {
        userId: candidateId,
        user: { id: candidateId, role: 'student', isAdmin: false },
      };

      mockContestRepo.findOne.mockResolvedValue({
        id: contestId,
        participants: ['other-user-1', 'other-user-2'],
      });

      await gateway.handleJoinContest({ contestId }, socket as never);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'You are not registered for this contest',
      });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('allows registered participant to join the contest room', async () => {
      const socket = createMockSocket();
      socket.data = {
        userId: candidateId,
        user: { id: candidateId, role: 'student', isAdmin: false },
      };

      mockContestRepo.findOne.mockResolvedValue({
        id: contestId,
        participants: [candidateId, 'other-user-2'],
      });

      await gateway.handleJoinContest({ contestId }, socket as never);

      expect(socket.join).toHaveBeenCalledWith(`contest_${contestId}`);
      expect(socket.to).toHaveBeenCalledWith(`contest_${contestId}`);
    });

    it('allows platform administrator to join contest room even without prior registration', async () => {
      const adminId = 'admin-uuid-1';
      const socket = createMockSocket();
      socket.data = {
        userId: adminId,
        user: { id: adminId, role: 'super_admin', isAdmin: true },
      };

      mockContestRepo.findOne.mockResolvedValue({
        id: contestId,
        participants: [],
      });

      await gateway.handleJoinContest({ contestId }, socket as never);

      expect(socket.join).toHaveBeenCalledWith(`contest_${contestId}`);
    });
  });

  describe('handleJoinUser isolation', () => {
    it('prevents standard candidate from joining another user room', () => {
      const socket = createMockSocket();
      socket.data = {
        userId: 'student-1',
        user: { id: 'student-1', role: 'student', isAdmin: false },
      };

      gateway.handleJoinUser({ userId: 'victim-student-2' }, socket as never);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Cannot join room belonging to another user',
      });
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('Headless worker event bridging via Redis (AUD-008)', () => {
    it('publishes event to Redis when server is undefined in headless worker process', () => {
      const mockRedisService = {
        publish: jest.fn().mockResolvedValue(1),
        createSubscriberClient: jest.fn().mockReturnValue({
          subscribe: jest.fn().mockResolvedValue(undefined),
          on: jest.fn(),
          quit: jest.fn(),
        }),
      };

      const workerGateway = new AppGateway(
        mockTokenService as never,
        mockContestRepo as never,
        mockRedisService as never,
      );
      // server is undefined in headless worker context
      workerGateway.server = undefined as never;

      workerGateway.emitToUser('candidate-1', 'submission_status', {
        submissionId: 'sub-1',
        status: 'running',
      });

      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'codeskill:ws:events',
        expect.stringContaining('"target":"user"'),
      );
      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'codeskill:ws:events',
        expect.stringContaining('"targetId":"candidate-1"'),
      );
    });
  });
});
