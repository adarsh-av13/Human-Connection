import Factory from '../../seed/factories'
import { gql } from '../../helpers/jest'
import { getDriver } from '../../bootstrap/neo4j'
import { createTestClient } from 'apollo-server-testing'
import createServer from '../.././server'

const factory = Factory()
const driver = getDriver()
let authenticatedUser
let user
let author
let variables
let query
let mutate

beforeAll(() => {
  const { server } = createServer({
    context: () => {
      return {
        driver,
        user: authenticatedUser,
      }
    },
  })
  query = createTestClient(server).query
  mutate = createTestClient(server).mutate
})

beforeEach(async () => {
  authenticatedUser = null
  variables = { orderBy: 'createdAt_asc' }
})

afterEach(async () => {
  await factory.cleanDatabase()
})

describe('given some notifications', () => {
  beforeEach(async () => {
    const categoryIds = ['cat1']
    author = await factory.create('User', { id: 'author' })
    user = await factory.create('User', { id: 'you' })
    const [neighbor, badWomen] = await Promise.all([
      factory.create('User', { id: 'neighbor' }),
      factory.create('User', { id: 'badWomen', name: 'Mrs. Badwomen' }),
      factory.create('Category', { id: 'cat1' }),
    ])
    const [post1, post2, post3, post4] = await Promise.all([
      factory.create('Post', { author, id: 'p1', categoryIds, content: 'Not for you' }),
      factory.create('Post', {
        author,
        id: 'p2',
        categoryIds,
        content: 'Already seen post mention',
      }),
      factory.create('Post', {
        author,
        id: 'p3',
        categoryIds,
        content: 'You have been mentioned in a post',
      }),
      factory.create('Post', {
        author,
        id: 'p4',
        categoryIds,
        title: 'Bad Post',
        content: 'I am bad content !!!',
      }),
    ])
    const [comment1, comment2, comment3, comment4] = await Promise.all([
      factory.create('Comment', {
        author,
        postId: 'p3',
        id: 'c1',
        content: 'You have seen this comment mentioning already',
      }),
      factory.create('Comment', {
        author,
        postId: 'p3',
        id: 'c2',
        content: 'You have been mentioned in a comment',
      }),
      factory.create('Comment', {
        author,
        postId: 'p3',
        id: 'c3',
        content: 'Somebody else was mentioned in a comment',
      }),
      factory.create('Comment', {
        author,
        postId: 'p4',
        id: 'c4',
        content: 'I am harassing content in a harassing comment to a bad post !!!',
      }),
    ])
    await Promise.all([
      post1.relateTo(neighbor, 'notified', {
        createdAt: '2019-08-29T17:33:48.651Z',
        updatedAt: '2019-08-29T17:33:48.651Z',
        read: false,
        reason: 'mentioned_in_post',
      }),
      post2.relateTo(user, 'notified', {
        createdAt: '2019-08-30T17:33:48.651Z',
        updatedAt: '2019-08-30T17:33:48.651Z',
        read: true,
        reason: 'mentioned_in_post',
      }),
      post3.relateTo(user, 'notified', {
        createdAt: '2019-08-31T17:33:48.651Z',
        updatedAt: '2019-08-31T17:33:48.651Z',
        read: false,
        reason: 'mentioned_in_post',
      }),
      comment1.relateTo(user, 'notified', {
        createdAt: '2019-08-30T15:33:48.651Z',
        updatedAt: '2019-08-30T15:33:48.651Z',
        read: true,
        reason: 'mentioned_in_comment',
      }),
      comment2.relateTo(user, 'notified', {
        createdAt: '2019-08-30T19:33:48.651Z',
        updatedAt: '2019-08-30T19:33:48.651Z',
        read: false,
        reason: 'mentioned_in_comment',
      }),
      comment3.relateTo(neighbor, 'notified', {
        createdAt: '2019-09-01T17:33:48.651Z',
        updatedAt: '2019-09-01T17:33:48.651Z',
        read: false,
        reason: 'mentioned_in_comment',
      }),
    ])

    // report notifications
    const [reportOnUser, reportOnPost, reportOnComment] = await Promise.all([
      factory.create('Report', {
        id: 'reportOnUser',
      }),
      factory.create('Report', {
        id: 'reportOnPost',
      }),
      factory.create('Report', {
        id: 'reportOnComment',
      }),
    ])
    await Promise.all([
      reportOnUser.relateTo(user, 'filed', {
        resourceId: 'badWomen',
        reasonCategory: 'discrimination_etc',
        reasonDescription: 'This user is harassing me with bigoted remarks!',
      }),
      reportOnUser.relateTo(badWomen, 'belongsTo'),
      reportOnPost.relateTo(user, 'filed', {
        resourceId: 'p4',
        reasonCategory: 'other',
        reasonDescription: "This shouldn't be shown to anybody else! It's my private thing!",
      }),
      reportOnPost.relateTo(post4, 'belongsTo'),
      reportOnComment.relateTo(user, 'filed', {
        resourceId: 'c4',
        reasonCategory: 'discrimination_etc',
        reasonDescription: 'This user is harassing me!',
      }),
      reportOnComment.relateTo(comment4, 'belongsTo'),
    ])
    await Promise.all([
      reportOnUser.relateTo(user, 'notified', {
        createdAt: '2020-01-15T16:33:48.651Z',
        updatedAt: '2020-01-15T16:33:48.651Z',
        read: false,
        reason: 'filed_report_on_resource',
      }),
      reportOnPost.relateTo(user, 'notified', {
        createdAt: '2020-01-16T10:33:48.651Z',
        updatedAt: '2020-01-16T10:33:48.651Z',
        read: true,
        reason: 'filed_report_on_resource',
      }),
      reportOnComment.relateTo(user, 'notified', {
        createdAt: '2020-01-14T12:33:48.651Z',
        updatedAt: '2020-01-14T12:33:48.651Z',
        read: false,
        reason: 'filed_report_on_resource',
      }),
    ])
  })

  describe('notifications', () => {
    const notificationQuery = gql`
      query($read: Boolean, $orderBy: NotificationOrdering) {
        notifications(read: $read, orderBy: $orderBy) {
          createdAt
          updatedAt
          read
          reason
          from {
            __typename
            ... on Post {
              content
            }
            ... on Comment {
              content
            }
            ... on Report {
              id
              filed {
                reasonCategory
                reasonDescription
                reportedResource {
                  __typename
                  ... on User {
                    id
                    name
                  }
                  ... on Post {
                    id
                    title
                    content
                  }
                  ... on Comment {
                    id
                    content
                  }
                }
              }
            }
          }
        }
      }
    `
    describe('unauthenticated', () => {
      it('throws authorization error', async () => {
        const { errors } = await query({ query: notificationQuery })
        expect(errors[0]).toHaveProperty('message', 'Not Authorised!')
      })
    })

    describe('authenticated', () => {
      beforeEach(async () => {
        authenticatedUser = await user.toJson()
      })

      describe('no filters', () => {
        it('returns all notifications of current user', async () => {
          const expected = {
            data: {
              notifications: expect.arrayContaining([
                {
                  createdAt: '2020-01-16T10:33:48.651Z',
                  updatedAt: '2020-01-16T10:33:48.651Z',
                  read: true,
                  reason: 'filed_report_on_resource',
                  from: {
                    __typename: 'Report',
                    id: 'reportOnPost',
                    filed: [
                      {
                        reasonCategory: 'other',
                        reasonDescription:
                          "This shouldn't be shown to anybody else! It's my private thing!",
                        reportedResource: {
                          __typename: 'Post',
                          id: 'p4',
                          title: 'Bad Post',
                          content: 'I am bad content !!!',
                        },
                      },
                    ],
                  },
                },
                {
                  createdAt: '2020-01-15T16:33:48.651Z',
                  updatedAt: '2020-01-15T16:33:48.651Z',
                  read: false,
                  reason: 'filed_report_on_resource',
                  from: {
                    __typename: 'Report',
                    id: 'reportOnUser',
                    filed: [
                      {
                        reasonCategory: 'discrimination_etc',
                        reasonDescription: 'This user is harassing me with bigoted remarks!',
                        reportedResource: {
                          __typename: 'User',
                          id: 'badWomen',
                          name: 'Mrs. Badwomen',
                        },
                      },
                    ],
                  },
                },
                {
                  createdAt: '2020-01-14T12:33:48.651Z',
                  updatedAt: '2020-01-14T12:33:48.651Z',
                  read: false,
                  reason: 'filed_report_on_resource',
                  from: {
                    __typename: 'Report',
                    id: 'reportOnComment',
                    filed: [
                      {
                        reasonCategory: 'discrimination_etc',
                        reasonDescription: 'This user is harassing me!',
                        reportedResource: {
                          __typename: 'Comment',
                          id: 'c4',
                          content: 'I am harassing content in a harassing comment to a bad post !!!',
                        },
                      },
                    ],
                  },
                },
                expect.objectContaining({
                  createdAt: '2019-08-31T17:33:48.651Z',
                  updatedAt: '2019-08-31T17:33:48.651Z',
                  read: false,
                  from: {
                    __typename: 'Post',
                    content: 'You have been mentioned in a post',
                  },
                }),
                expect.objectContaining({
                  createdAt: '2019-08-30T19:33:48.651Z',
                  updatedAt: '2019-08-30T19:33:48.651Z',
                  read: false,
                  from: {
                    __typename: 'Comment',
                    content: 'You have been mentioned in a comment',
                  },
                }),
                expect.objectContaining({
                  createdAt: '2019-08-30T17:33:48.651Z',
                  updatedAt: '2019-08-30T17:33:48.651Z',
                  read: true,
                  from: {
                    __typename: 'Post',
                    content: 'Already seen post mention',
                  },
                }),
                expect.objectContaining({
                  createdAt: '2019-08-30T15:33:48.651Z',
                  updatedAt: '2019-08-30T15:33:48.651Z',
                  read: true,
                  from: {
                    __typename: 'Comment',
                    content: 'You have seen this comment mentioning already',
                  },
                }),
              ]),
            },
            errors: undefined,
          }

          const response = await query({ query: notificationQuery, variables })
          await expect(response).toMatchObject(expected)
          await expect(response.data.notifications.length).toEqual(7) // has to be checked, because of 'arrayContaining'
        })
      })

      describe('filter for read: false', () => {
        it('returns only unread notifications of current user', async () => {
          const expected = {
            data: {
              notifications: expect.arrayContaining([
                {
                  createdAt: '2019-08-30T19:33:48.651Z',
                  updatedAt: '2019-08-30T19:33:48.651Z',
                  read: false,
                  reason: 'mentioned_in_comment',
                  from: {
                    __typename: 'Comment',
                    content: 'You have been mentioned in a comment',
                  },
                },
                {
                  createdAt: '2019-08-31T17:33:48.651Z',
                  updatedAt: '2019-08-31T17:33:48.651Z',
                  read: false,
                  reason: 'mentioned_in_post',
                  from: {
                    __typename: 'Post',
                    content: 'You have been mentioned in a post',
                  },
                },
                {
                  createdAt: '2020-01-15T16:33:48.651Z',
                  updatedAt: '2020-01-15T16:33:48.651Z',
                  read: false,
                  reason: 'filed_report_on_resource',
                  from: {
                    __typename: 'Report',
                    id: 'reportOnUser',
                    filed: [
                      {
                        reasonCategory: 'discrimination_etc',
                        reasonDescription: 'This user is harassing me with bigoted remarks!',
                        reportedResource: {
                          __typename: 'User',
                          id: 'badWomen',
                          name: 'Mrs. Badwomen',
                        },
                      },
                    ],
                  },
                },
                {
                  createdAt: '2020-01-14T12:33:48.651Z',
                  updatedAt: '2020-01-14T12:33:48.651Z',
                  read: false,
                  reason: 'filed_report_on_resource',
                  from: {
                    __typename: 'Report',
                    id: 'reportOnComment',
                    filed: [
                      {
                        reasonCategory: 'discrimination_etc',
                        reasonDescription: 'This user is harassing me!',
                        reportedResource: {
                          __typename: 'Comment',
                          id: 'c4',
                          content: 'I am harassing content in a harassing comment to a bad post !!!',
                        },
                      },
                    ],
                  },
                },
              ]),
            },
            errors: undefined,
          }

          const response = await query({
            query: notificationQuery,
            variables: { ...variables, read: false },
          })
          await expect(response).toMatchObject(expected)
          await expect(response.data.notifications.length).toEqual(4) // has to be checked, because of 'arrayContaining'
        })

        describe('if a resource gets deleted', () => {
          const deletePostAction = async () => {
            authenticatedUser = await author.toJson()
            const deletePostMutation = gql`
              mutation($id: ID!) {
                DeletePost(id: $id) {
                  id
                  deleted
                }
              }
            `
            await expect(
              mutate({ mutation: deletePostMutation, variables: { id: 'p3' } }),
            ).resolves.toMatchObject({
              data: { DeletePost: { id: 'p3', deleted: true } },
              errors: undefined,
            })
            authenticatedUser = await user.toJson()
          }

          it('reduces notifications list', async () => {
            let response

            response = await query({
              query: notificationQuery,
              variables: { ...variables, read: false },
            })
            await expect(response).toMatchObject({
              data: { notifications: expect.any(Array) },
              errors: undefined,
            })
            await expect(response.data.notifications.length).toEqual(4)

            await deletePostAction()

            response = await query({
              query: notificationQuery,
              variables: { ...variables, read: false },
            })
            await expect(response).toMatchObject({
              data: { notifications: expect.any(Array) },
              errors: undefined,
            })
            await expect(response.data.notifications.length).toEqual(2)
          })
        })
      })
    })
  })

  describe('markAsRead', () => {
    const markAsReadMutation = gql`
      mutation($id: ID!) {
        markAsRead(id: $id) {
          createdAt
          read
          from {
            __typename
            ... on Post {
              content
            }
            ... on Comment {
              content
            }
            ... on Report {
              id
            }
          }
        }
      }
    `
    describe('unauthenticated', () => {
      it('throws authorization error', async () => {
        const result = await mutate({
          mutation: markAsReadMutation,
          variables: { ...variables, id: 'p1' },
        })
        expect(result.errors[0]).toHaveProperty('message', 'Not Authorised!')
      })
    })

    describe('authenticated', () => {
      beforeEach(async () => {
        authenticatedUser = await user.toJson()
      })

      describe('not being notified at all', () => {
        beforeEach(async () => {
          variables = {
            id: 'p1',
          }
        })

        it('returns null', async () => {
          const response = await mutate({ mutation: markAsReadMutation, variables })
          expect(response.data.markAsRead).toEqual(null)
          expect(response.errors).toBeUndefined()
        })
      })

      describe('being notified', () => {
        describe('on a post', () => {
          beforeEach(async () => {
            variables = {
              id: 'p3',
            }
          })

          it('updates `read` attribute and returns NOTIFIED relationship', async () => {
            const response = await mutate({ mutation: markAsReadMutation, variables })
            expect(response).toMatchObject({
              data: {
                markAsRead: {
                  createdAt: '2019-08-31T17:33:48.651Z',
                  read: true,
                  from: {
                    __typename: 'Post',
                    content: 'You have been mentioned in a post',
                  },
                },
              },
              errors: undefined,
            })
          })

          describe('but notification was already marked as read', () => {
            beforeEach(async () => {
              variables = {
                id: 'p2',
              }
            })

            it('returns null', async () => {
              const response = await mutate({ mutation: markAsReadMutation, variables })
              expect(response.data.markAsRead).toEqual(null)
              expect(response.errors).toBeUndefined()
            })
          })
        })

        describe('on a comment', () => {
          beforeEach(async () => {
            variables = {
              id: 'c2',
            }
          })

          it('updates `read` attribute and returns NOTIFIED relationship', async () => {
            const response = await mutate({ mutation: markAsReadMutation, variables })
            expect(response).toMatchObject({
              data: {
                markAsRead: {
                  createdAt: '2019-08-30T19:33:48.651Z',
                  read: true,
                  from: {
                    __typename: 'Comment',
                    content: 'You have been mentioned in a comment',
                  },
                },
              },
              errors: undefined,
            })
          })
        })

        describe('on a report', () => {
          beforeEach(async () => {
            variables = {
              id: 'reportOnComment',
            }
          })

          it('updates `read` attribute and returns NOTIFIED relationship', async () => {
            const response = await mutate({ mutation: markAsReadMutation, variables })
            expect(response).toMatchObject({
              data: {
                markAsRead: {
                  createdAt: '2020-01-14T12:33:48.651Z',
                  read: true,
                  from: {
                    __typename: 'Report',
                    id: 'reportOnComment',
                  },
                },
              },
              errors: undefined,
            })
          })
        })
      })
    })
  })
})
