import express, { type Request, type Response } from "express";
import fileUpload, { type UploadedFile } from "express-fileupload";
import { PDFParse } from "pdf-parse";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8080;

// allow cross-origin requests from specified origins
app.use(
    cors({
        origin: ["http://localhost:3000", "https://yourwebsite.com"],
    }),
);

// middleware to handle file uploads
app.use(
    fileUpload({
        limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
        abortOnLimit: true,
    }),
);

// health check endpoint
app.get("/", (_req: Request, res: Response) => {
    res.json({ message: "PDF Parser API is running" });
});

// function to parse PDF buffer
async function parsePDF(file: Uint8Array) {
    const parser = new PDFParse(file);
    const data = await parser.getText();
    const info = await parser.getInfo({ parsePageInfo: true });
    return { text: data?.text || "", info, numpages: info?.pages || 0 };
}

// PDF upload and parsing endpoint
app.post("/upload", async (req: Request, res: Response) => {
    try {
        if (!req.files || !("file" in req.files)) {
            return res.status(400).json({
                error: "No PDF file shared.",
                body: `Body is ${JSON.stringify(req.body)}`,
            });
        }

        const pdfFile = req.files.file as UploadedFile;
        const unit8ArrayData = new Uint8Array(pdfFile?.data);
        const result = await parsePDF(unit8ArrayData);
        console.log("PDF parsed successfully: ", result);
        res.json({ result, success: true });
    } catch (error) {
        console.error("Error processing PDF:", error);
        if (error instanceof Error) {
            return res.status(500).json({ error: error.message, success: false });
        } else if (
            error instanceof Error &&
            error.message.includes("PDF file is empty")
        ) {
            return res.status(500).json({ error: error.message, success: false });
        }
        res.status(500).json({
            error: "Failed to process PDF due to an unknown error.",
            success: false,
        });
    }
});

// function to extract text from a range of pages
async function parsePageRangeFromPDF(
    file: Uint8Array,
    startPage: number,
    endPage: number,
) {
    const parser = new PDFParse(file);
    const info = await parser.getInfo({ parsePageInfo: true });
    const totalPages = Array.isArray(info?.pages)
        ? info.pages.length
        : (info?.pages as number) || 0;

    if (startPage < 1 || endPage > totalPages || startPage > endPage) {
        throw new Error(
            `Invalid page range. PDF has ${totalPages} pages. Please provide a valid range where start >= 1, end <= ${totalPages}, and start <= end.`,
        );
    }

    const data = await parser.getText();
    const lines = data?.text?.split("\n") || [];

    // Note: pdf-parse doesn't provide direct page filtering, so getText() returns all text
    // For accurate page range extraction, consider using a different PDF library
    return { text: data?.text || "", startPage, endPage, totalPages };
}

// Page range PDF text extraction endpoint
app.post("/upload-page-range", async (req: Request, res: Response) => {
    try {
        if (!req.files || !("file" in req.files)) {
            return res.status(400).json({
                error: "No PDF file shared.",
            });
        }

        // Get page range from query params or body
        const startPage = parseInt(
            (req.query.startPage as string) || (req.body?.startPage as string) || "1",
        );
        const endPage = parseInt(
            (req.query.endPage as string) || (req.body?.endPage as string) || "1",
        );

        if (isNaN(startPage) || isNaN(endPage)) {
            return res.status(400).json({
                error:
                    "Invalid page range. Please provide valid integers for startPage and endPage.",
            });
        }

        const pdfFile = req.files.file as UploadedFile;
        const unit8ArrayData = new Uint8Array(pdfFile?.data);
        const result = await parsePageRangeFromPDF(
            unit8ArrayData,
            startPage,
            endPage,
        );
        console.log(
            `Pages ${startPage}-${endPage} extracted successfully: `,
            result,
        );
        res.json({ result, success: true });
    } catch (error) {
        console.error("Error processing PDF: ", error);
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message, success: false });
        }
        res.status(500).json({
            error: "Failed to process PDF due to an unknown error.",
            success: false,
        });
    }
});

// function to convert PDF date string to readable date format
function convertPDFDateToReadable(pdfDateString: string): string {
    try {
        // Remove "D:" prefix if present
        let dateStr = pdfDateString.startsWith("D:")
            ? pdfDateString.slice(2)
            : pdfDateString;

        // Extract date and time components (format: YYYYMMDDHHmmss)
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const hour = dateStr.substring(8, 10);
        const minute = dateStr.substring(10, 12);
        const second = dateStr.substring(12, 14);

        // Validate date components
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);

        if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
            throw new Error("Invalid date values");
        }

        // Return in dd/mm/yyyy format
        return `${day}/${month}/${year}`;
    } catch (error) {
        console.error("Error converting PDF date:", error);
        return "Invalid date";
    }
}

// function to extract metadata from PDF
async function getPDFMetadata(file: Uint8Array) {
    const parser = new PDFParse(file);
    const info = await parser.getInfo({ parsePageInfo: true });
    return {
        title: info?.info?.Title || "N/A",
        author: info?.info?.Author || "N/A",
        subject: info?.info?.Subject || "N/A",
        creator: info?.info?.Creator || "N/A",
        producer: info?.info?.Producer || "N/A",
        creationDate: convertPDFDateToReadable(info?.info?.CreationDate || "N/A"),
        modificationDate: convertPDFDateToReadable(info?.info?.ModDate || "N/A"),
        pages: info?.total || 0,
    };
}

// Metadata-only endpoint
app.post("/metadata", async (req: Request, res: Response) => {
    try {
        if (!req.files || !("file" in req.files)) {
            return res.status(400).json({
                error: "No PDF file shared.",
            });
        }

        const pdfFile = req.files.file as UploadedFile;
        const unit8ArrayData = new Uint8Array(pdfFile?.data);
        const metadata = await getPDFMetadata(unit8ArrayData);

        console.log("PDF metadata extracted successfully: ", metadata);
        res.json({ metadata, success: true });
    } catch (error) {
        console.error("Error extracting metadata:", error);
        if (error instanceof Error) {
            return res.status(500).json({ error: error.message, success: false });
        }
        res.status(500).json({
            error: "Failed to extract metadata due to an unknown error.",
            success: false,
        });
    }
});

// function to search for text within a PDF
async function searchPDFText(
    file: Uint8Array,
    searchQuery: string,
    caseSensitive: boolean = false
) {
    const parser = new PDFParse(file);
    const info = await parser.getInfo({ parsePageInfo: true });
    const totalPages = Array.isArray(info?.pages)
        ? info.pages.length
        : (info?.pages as number) || 0;

    const results = {
        query: searchQuery,
        caseSensitive,
        matchCount: 0,
        matches: [] as Array<{
            page: number;
            text: string;
            position: number;
        }>,
    };

    // Extract text from all pages
    for (let page = 1; page <= totalPages; page++) {
        const data = await parser.getText();
        const pageText = data?.text || "";

        // Determine search text based on case sensitivity
        const searchText = caseSensitive ? searchQuery : searchQuery.toLowerCase();
        const compareText = caseSensitive ? pageText : pageText.toLowerCase();

        let searchIndex = 0;
        while ((searchIndex = compareText.indexOf(searchText, searchIndex)) !== -1) {
            // Extract context (100 characters before and after)
            const startContext = Math.max(0, searchIndex - 50);
            const endContext = Math.min(pageText.length, searchIndex + searchQuery.length + 50);
            const contextText = pageText.substring(startContext, endContext);

            results.matches.push({
                page,
                text: contextText.trim(),
                position: searchIndex,
            });

            results.matchCount++;
            searchIndex += searchText.length;
        }
    }

    return results;
}

// PDF text search endpoint
app.post("/search", async (req: Request, res: Response) => {
    try {
        if (!req.files || !("file" in req.files)) {
            return res.status(400).json({
                error: "No PDF file shared.",
            });
        }

        // Get search query and options
        const query = (req.query.query as string) || (req.body?.query as string);
        const caseSensitive =
            (req.query.caseSensitive as string) === "true" ||
            req.body?.caseSensitive === true;

        if (!query || query.trim() === "") {
            return res.status(400).json({
                error: "Search query is required.",
            });
        }

        const pdfFile = req.files.file as UploadedFile;
        const unit8ArrayData = new Uint8Array(pdfFile?.data);
        const results = await searchPDFText(unit8ArrayData, query, caseSensitive);

        if (results.matchCount === 0) {
            return res.json({
                result: results,
                success: true,
                message: "No matches found.",
            });
        }

        console.log(`Found ${results.matchCount} matches for "${query}"`);
        res.json({ result: results, success: true });
    } catch (error) {
        console.error("Error searching PDF:", error);
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message, success: false });
        }
        res.status(500).json({
            error: "Failed to search PDF due to an unknown error.",
            success: false,
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});