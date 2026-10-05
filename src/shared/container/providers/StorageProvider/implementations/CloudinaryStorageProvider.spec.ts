import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CloudinaryStorageProvider } from "./CloudinaryStorageProvider";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), end: vi.fn(), config: vi.fn() }));
vi.mock("cloudinary", () => ({ v2: { config: mocks.config, uploader: { upload_stream: mocks.upload } } }));

describe("Cloudinary post media", () => {
  beforeEach(() => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "salon-assets");
    vi.stubEnv("CLOUDINARY_API_KEY", "test-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
    vi.clearAllMocks();
    mocks.upload.mockImplementation((_options, callback) => {
      callback(null, { secure_url: "https://res.cloudinary.com/salon-assets/video/upload/posts/video-test.mp4", public_id: "posts/video-test", bytes: 10 });
      return { end: mocks.end };
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uploads videos as video rather than image", async () => {
    await new CloudinaryStorageProvider().uploadBuffer("posts", "video-test.mp4", Buffer.from("fixture"), "video/mp4");
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ resource_type: "video", folder: "posts" }), expect.any(Function));
  });

  it("preserves image upload behavior", async () => {
    await new CloudinaryStorageProvider().uploadBuffer("posts", "photo.png", Buffer.from("fixture"), "image/png");
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ resource_type: "image" }), expect.any(Function));
  });

  it("recognizes versioned video URLs and rejects foreign origins/clouds", () => {
    const storage = new CloudinaryStorageProvider();
    expect(storage.extractObjectName("https://res.cloudinary.com/salon-assets/video/upload/v123/posts/video-test.mp4")).toBe("posts/video-test.mp4");
    expect(storage.extractObjectName("https://res.cloudinary.com/other/video/upload/posts/video-test.mp4")).toBeNull();
    expect(storage.extractObjectName("https://evil.example/?url=https://res.cloudinary.com/salon-assets/image/upload/posts/photo.png")).toBeNull();
  });
});
