const functions = require('firebase-functions');
const admin = require('firebase-admin');
const mongodb = require('mongodb');
const express = require('express');
const bodyParser = require("body-parser");
const cors = require('cors');
admin.initializeApp(functions.config().firebase);
const db = admin.firestore();
const usersRef = db.collection('users');
const contactsRef = db.collection('contacts');
const messageRef = db.collection('messages');
const chatsRef = db.collection('chats');


const app = express();
const main = express();

main.use(cors());
main.use('/api/v1', app);
main.use(bodyParser.json());

// contacts and db parser function
const parseContacts = async (contacts, user_id) => {
    try {
        const user_info = await usersRef.doc(user_id).get();
        // array holder for final contact values
        const newContacts = [];
        // array holder for duplicate values checking
        const duplicateContactsBuffer = [];
        // create query for each contact
        const queries = contacts.map((f) => usersRef.where('generatedPhones', 'array-contains', f.phone).limit(1).get());
        // dispatch all queries concurrently
        const request = await Promise.all(queries);
        // create new contact instance and push to holder variable
        request.map((doc, i) => {
            // if result is empty
            if (doc.empty) return null;
            // if its the owner of the account has his own contact
            if (user_info.data().generatedPhones.includes(doc.docs[0].data().phone)) return null;
            // if it has been generated before using the duplicate buffer
            if (duplicateContactsBuffer.includes(JSON.stringify({
                avatar: doc.docs[0].data().avatar || "",
                display_name: contacts[i].display_name || doc.docs[0].data().username,
                email: doc.docs[0].data().email || "",
                ecodeem_id: doc.docs[0].data().ecodeem_id || "",
                phone: doc.docs[0].data().phone || "",
                username: doc.docs[0].data().username || "",
                generatedPhones: doc.docs[0].data().generatedPhones || [],
            }))) return null;
            // populate both the buffer and actual array if it passes all tests
            duplicateContactsBuffer.push(JSON.stringify({
                avatar: doc.docs[0].data().avatar || "",
                display_name: contacts[i].display_name || doc.docs[0].data().username,
                email: doc.docs[0].data().email || "",
                ecodeem_id: doc.docs[0].data().ecodeem_id || "",
                phone: doc.docs[0].data().phone || "",
                username: doc.docs[0].data().username || "",
                generatedPhones: doc.docs[0].data().generatedPhones || [],
            }));
            return newContacts.push({
                avatar: doc.docs[0].data().avatar || "",
                display_name: contacts[i].display_name || doc.docs[0].data().username,
                email: doc.docs[0].data().email || "",
                ecodeem_id: doc.docs[0].data().ecodeem_id || "",
                phone: doc.docs[0].data().phone || "",
                username: doc.docs[0].data().username || "",
                generatedPhones: doc.docs[0].data().generatedPhones || [],
            });
        });
        return newContacts;
    } catch (error) {
        console.log(error);
        return [];
    }
}

const syncContacts = async (contacts, user_id) => {
    try {
        // prepare new contacts function
        const parsedContacts = await parseContacts(contacts, user_id);
        if (parsedContacts.length !== 0) {
            // delete all contacts registered for a user that do not exist
            await contactsRef.where("user_id", '==', user_id).get().then((querySnapshot) => {
                return querySnapshot.forEach(async (doc) => {
                    const found = contacts.find((element) => {
                        return element.phone === doc.data().phone || doc.data().generatedPhones.includes(element.phone);
                    });
                    if (found === undefined || found === null) {
                        await doc.ref.delete();
                    }

                });
            });
            // create new instances for already prepared contacts
            await parsedContacts.forEach(async (contact_info) => {
                await contactsRef.doc().set({
                    user_id: user_id,
                    ...contact_info,
                }, { merge: true });
            });
        }
    } catch (error) {
        console.log(error);
    }

}

// route to parse contacts
app.post('/parseContacts', async (req, res) => {
    try {
        const { contacts, user_id } = req.body;

        if (contacts.length < 3) {
            syncContacts(contacts, user_id);
        } else {
            // buffer array for promise methods
            let promisesArray = [];
            // clone array
            let newContacts = [...contacts];
            // default chunksize set to 15
            let chunk_size = 15;
            // buffer array for chunks
            let tempArray = [];
            // counter
            let index = 0;
            // split into chunks
            for (index = 0; index < newContacts.length; index += chunk_size) {
                tempArray.push(newContacts.slice(index, index + chunk_size));
            }
            // prepare promise methods
            tempArray.forEach(arr => {
                promisesArray.push(syncContacts(arr, user_id));
            });
            // send a request for batch
            await Promise.all([...promisesArray]);
        }
        // final response
        return res.json({
            success: true,
            message: "processing initiated"
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        });
    }
});

// route to signup new user
app.post("/signup", async (req, res) => {
    try {
        const { country, ecodeem_id, email, phone, username, avatar, generatedPhones } = req.body;
        await usersRef.doc(ecodeem_id).set({
            conversations: [],
            avatar: avatar,
            country: country,
            ecodeem_id: ecodeem_id,
            email: email,
            last_seen: new Date(),
            online: true,
            phone: phone,
            username: username,
            generatedPhones: generatedPhones
        });
        return res.json({
            success: true,
            message: "user created"
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        });
    }
});

// route to update user details
app.put("/update", async (req, res) => {
    try {
        const { ecodeem_id } = req.body;
        await usersRef.doc(ecodeem_id).set({ ...req.body }, { merge: true });
        return res.json({
            success: true,
            message: "user updated"
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        })
    }
});

// route to delete existing user
app.delete("/delete/:ecodeem_id", async (req, res) => {
    try {
        const { ecodeem_id } = req.params;
        await usersRef.doc(ecodeem_id).delete();
        return res.json({
            success: true,
            message: "user deleted"
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        })
    }
});

//route to switch status
app.get("/users/:user_id/status/:status", async (req, res) => {
    try {
        const { user_id, status } = req.params;
        await usersRef.doc(user_id).update({
            online: status === 'online' ? true : false,
            last_seen: new Date()
        });
        return res.json({
            success: true,
            message: 'user status changed'
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        });
    }
})

// route for status check on function
app.get('/', async (req, res) => {
    res.json({
        success: true,
        message: "application online"
    });
})

exports.webApi = functions.runWith({
    timeoutSeconds: 540,
    memory: '2GB'
}).https.onRequest(main);


const prepareLastMessage = (message_data) => {
    switch (message_data.type) {
        case "text":
            return message_data.text;
        case "image":
            return "Image received";
        case "video":
            return "Video received";
        case "post":
            return "Ecodeem post received";
        default:
            return "Message received";
    }
}

const notifyRecipient = async (message_data, receiver, sender) => {
    const payload = {
        notification: {
            title: sender.username,
            body: prepareLastMessage(message_data),
        },
        data: {
            chat: message_data.chat_id,
            click_action: "FLUTTER_NOTIFICATION_CLICK"
        }
    };
    await admin.messaging().sendToDevice(receiver.uid, payload, { priority: "high" });
}

// listener for chat changes to update user conversations and send notifications
exports.syncSingleChatWithConversations = functions.firestore.document('messages/{message_id}').onCreate((change, context) => {
    try {
        const chat_id = change.data().chat_id;
        const usersArray = chat_id.split("-");
        // get receipient index
        const recepientIndex = usersArray.findIndex(e => e !== change.data().from);
        usersArray.forEach(async (user, index) => {
            await usersRef.doc(user).set({
                conversations: [{
                    chat_id: chat_id,
                    user_id: usersArray[index === 0 ? 1 : 0],
                    date: new Date(),
                    last_message: prepareLastMessage(change.data()),
                }],
            }, { merge: true });
            if (index === recepientIndex) {
                const usersData = await Promise.all([usersRef.doc(user).get(), usersRef.doc(usersArray[index === 0 ? 1 : 0]).get(),])
                await notifyRecipient(change.data(), usersData[0].data(), usersData[1].data());
            }
        });
        return;
    } catch (error) {
        console.log(error);
    }
});
