import { AppError } from "@/shared/errors/AppError";
import { SocialRepository, type PublicPostRow, type CommentRow } from "./socialRepository";

export type SocialActor = { id: string; role: string; barbershopId?: string };

export function toPublicPost(post: PublicPostRow) {
  return {
    id: post.id, barbershopId: post.barbershopId, type: post.type.toLowerCase(),
    title: post.title ?? undefined, content: post.content, imageUrl: post.imageUrl ?? undefined,
    videoUrl: post.videoUrl ?? undefined, likes: post.likes, createdAt: post.createdAt.getTime(),
    publishedAt: post.publishedAt?.getTime(), status: "published", format: post.format.toLowerCase(),
    postMode: post.postMode.toLowerCase(), ctaText: post.ctaText,
    authorName: post.author?.name ?? "Equipe", shopName: post.barbershop.name,
    shopLogoUrl: post.barbershop.logoUrl ?? undefined, commentsCount: post._count.comments,
  };
}

function toComment(row: CommentRow) {
  return {
    id: row.id, content: row.content, createdAt: row.createdAt.toISOString(),
    authorId: row.authorId ?? row.clientIdentityId ?? undefined,
    authorName: row.author?.name ?? row.clientIdentity?.name ?? "Conta removida",
  };
}

export class SocialUseCases {
  constructor(private readonly repo = new SocialRepository()) {}

  private async publishedPost(salonId: string, postId: string) {
    const post = await this.repo.getPost(salonId, postId);
    if (!post) throw new AppError("Publicação não encontrada", 404);
    return post;
  }

  private async actor(actor: SocialActor | undefined) {
    if (!actor) throw new AppError("Entre na sua conta para comentar", 401);
    const current = await this.repo.validateActor(actor);
    if (!current) throw new AppError("Sessão inválida", 401);
    return current;
  }

  private assertModerator(actor: SocialActor, salonId: string) {
    if (actor.role === "MASTER_ADMIN") return;
    if (actor.role !== "OWNER" || actor.barbershopId !== salonId) throw new AppError("Apenas o responsável pelo salão pode moderar este conteúdo", 403);
  }

  async getPost(salonId: string, postId: string) {
    return toPublicPost(await this.publishedPost(salonId, postId));
  }

  async stories(salonId: string) {
    return (await this.repo.stories(salonId)).map(toPublicPost);
  }

  async comments(salonId: string, postId: string, page: number) {
    await this.publishedPost(salonId, postId);
    const limit = 20;
    const { data, total } = await this.repo.comments(postId, page, limit);
    return { data: data.map(toComment), meta: { page, limit, total } };
  }

  async comment(salonId: string, postId: string, content: string, user?: SocialActor) {
    await this.publishedPost(salonId, postId);
    const actor = await this.actor(user);
    return toComment(await this.repo.createComment(postId, content, actor));
  }

  async deleteComment(salonId: string, postId: string, commentId: string, user?: SocialActor) {
    await this.publishedPost(salonId, postId);
    const actor = await this.actor(user);
    const comment = await this.repo.getComment(postId, commentId);
    if (!comment) throw new AppError("Comentário não encontrado", 404);
    const own = actor.role === "CLIENT" ? comment.clientIdentityId === actor.id : comment.authorId === actor.id;
    if (!own) this.assertModerator(actor, salonId);
    await this.repo.deleteComment(postId, commentId);
  }

  async tagged(salonId: string, pending: boolean, user?: SocialActor) {
    if (pending) this.assertModerator(await this.actor(user), salonId);
    return (await this.repo.tagged(salonId, pending)).map(tag => ({
      id: tag.id, postId: tag.postId, barbershopId: tag.barbershopId,
      status: tag.approvedAt ? "APPROVED" : "PENDING", post: toPublicPost(tag.post),
    }));
  }

  async requestTag(salonId: string, postId: string, targetId: string, user?: SocialActor) {
    const post = await this.publishedPost(salonId, postId);
    const actor = await this.actor(user);
    const sourceStaff = ["OWNER", "EMPLOYEE"].includes(actor.role) && actor.barbershopId === salonId;
    if (actor.role !== "MASTER_ADMIN" && !sourceStaff) throw new AppError("Você não pode marcar salões nesta publicação", 403);
    if (post.format === "STORY") throw new AppError("Marcações estão disponíveis nas publicações do feed", 400);
    if (targetId === salonId) throw new AppError("Escolha outro salão para marcar", 400);
    if (!await this.repo.activeSalon(targetId)) throw new AppError("Salão não encontrado", 404);
    await this.repo.requestTag(postId, targetId, actor.id);
  }

  async moderateTag(salonId: string, tagId: string, approve: boolean, user?: SocialActor) {
    this.assertModerator(await this.actor(user), salonId);
    const result = await this.repo.moderateTag(salonId, tagId, approve);
    if (!result.count) throw new AppError("Marcação não encontrada ou já moderada", 404);
  }
}
