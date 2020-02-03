import extractMentionedUsers from './mentions/extractMentionedUsers'
import { validateNotifyUsers } from '../validation/validationMiddleware'

const debug = require('debug')('backend:notificationsMiddleware')

const handleContentDataOfPost = async (resolve, root, args, context, resolveInfo) => {
  const idsOfUsers = extractMentionedUsers(args.content)
  const post = await resolve(root, args, context, resolveInfo)
  if (post && idsOfUsers && idsOfUsers.length)
    await notifyUsersOfMention('Post', post.id, idsOfUsers, 'mentioned_in_post', context)
  return post
}

const handleContentDataOfComment = async (resolve, root, args, context, resolveInfo) => {
  const { content } = args
  let idsOfUsers = extractMentionedUsers(content)
  const comment = await resolve(root, args, context, resolveInfo)
  const [postAuthor] = await postAuthorOfComment(comment.id, { context })
  idsOfUsers = idsOfUsers.filter(id => id !== postAuthor.id)
  if (idsOfUsers && idsOfUsers.length)
    await notifyUsersOfMention('Comment', comment.id, idsOfUsers, 'mentioned_in_comment', context)
  if (context.user.id !== postAuthor.id)
    await notifyUsersOfComment('Comment', comment.id, postAuthor.id, 'commented_on_post', context)
  return comment
}

const postAuthorOfComment = async (commentId, { context }) => {
  const session = context.driver.session()
  let postAuthorId
  try {
    postAuthorId = await session.readTransaction(transaction => {
      return transaction.run(
        `
          MATCH (author:User)-[:WROTE]->(:Post)<-[:COMMENTS]-(:Comment { id: $commentId })
          RETURN author { .id } as authorId
        `,
        { commentId },
      )
    })
    return postAuthorId.records.map(record => record.get('authorId'))
  } catch (error) {
    debug(error)
  } finally {
    session.close()
  }
}

const notifyUsersOfMention = async (label, id, idsOfUsers, reason, context) => {
  await validateNotifyUsers(label, reason)
  let mentionedCypher
  switch (reason) {
    case 'mentioned_in_post': {
      mentionedCypher = `
        MATCH (post: Post { id: $id })<-[:WROTE]-(author: User)
        MATCH (user: User)
        WHERE user.id in $idsOfUsers
        AND NOT (user)-[:BLOCKED]-(author)
        MERGE (post)-[notification:NOTIFIED {reason: $reason}]->(user)
      `
      break
    }
    case 'mentioned_in_comment': {
      mentionedCypher = `
        MATCH (postAuthor: User)-[:WROTE]->(post: Post)<-[:COMMENTS]-(comment: Comment { id: $id })<-[:WROTE]-(author: User)
        MATCH (user: User)
        WHERE user.id in $idsOfUsers
        AND NOT (user)-[:BLOCKED]-(author)
        AND NOT (user)-[:BLOCKED]-(postAuthor)
        MERGE (comment)-[notification:NOTIFIED {reason: $reason}]->(user)
      `
      break
    }
  }
  mentionedCypher += `
    SET notification.read = FALSE
    SET ( CASE WHEN notification.createdAt IS NULL THEN notification END ).createdAt = toString(datetime())
    SET notification.updatedAt = toString(datetime())
  `
  const session = context.driver.session()
  try {
    await session.writeTransaction(transaction => {
      return transaction.run(mentionedCypher, { id, idsOfUsers, reason })
    })
  } catch (error) {
    debug(error)
  } finally {
    session.close()
  }
}

const notifyUsersOfComment = async (label, commentId, postAuthorId, reason, context) => {
  await validateNotifyUsers(label, reason)
  const session = context.driver.session()

  try {
    await session.writeTransaction(async transaction => {
      await transaction.run(
        `
          MATCH (postAuthor:User {id: $postAuthorId})-[:WROTE]->(post:Post)<-[:COMMENTS]-(comment:Comment { id: $commentId })<-[:WROTE]-(commenter:User)
          WHERE NOT (postAuthor)-[:BLOCKED]-(commenter)
          MERGE (comment)-[notification:NOTIFIED {reason: $reason}]->(postAuthor)
          SET notification.read = FALSE
          SET ( CASE WHEN notification.createdAt IS NULL THEN notification END ).createdAt = toString(datetime())
          SET notification.updatedAt = toString(datetime())
        `,
        { commentId, postAuthorId, reason },
      )
    })
  } catch (error) {
    debug(error)
  } finally {
    session.close()
  }
}

const notifyReportFiler = async (resolve, root, args, context, resolveInfo) => {
  const report = await resolve(root, args, context, resolveInfo)

  if (report) {
    const { resourceId } = args
    const { driver, user } = context
    const { id: reportId } = report
    const session = driver.session()
    try {
      await session.writeTransaction(async transaction => {
        await transaction.run(
          `
            MATCH (resource {id: $resourceId})<-[:BELONGS_TO]-(report:Report {id: $reportId})<-[:FILED]-(submitter:User {id: $submitterId})
            WHERE resource: User OR resource: Post OR resource: Comment
            MERGE (report)-[notification:NOTIFIED {reason: $reason}]->(submitter)
            ON CREATE SET notification.createdAt = toString(datetime()), notification.updatedAt = notification.createdAt
            ON MATCH SET notification.updatedAt = toString(datetime())
            SET notification.read = FALSE
          `,
          {
            reportId,
            resourceId,
            submitterId: user.id,
            reason: 'filed_report_on_resource',
          },
        )
      })
    } catch (error) {
      debug(error)
    } finally {
      session.close()
    }
  }

  return report
}

export default {
  Mutation: {
    CreatePost: handleContentDataOfPost,
    UpdatePost: handleContentDataOfPost,
    CreateComment: handleContentDataOfComment,
    UpdateComment: handleContentDataOfComment,
    fileReport: notifyReportFiler,
  },
}
