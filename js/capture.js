jQuery(document).ready(function ($) {
  let capturing = false;
  let capturedCanvas = null;

  // Wait for jsPDF to be available
  if (typeof window.jspdf === "undefined") {
    window.jspdf = window.jsPDF;
  }

  // Create a promise-based delay function
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Smooth scroll function
  async function smoothScroll(to) {
    return new Promise(async (resolve) => {
      window.scrollTo({
        top: to,
        behavior: "smooth",
      });
      // Wait for scroll to complete
      await delay(500);
      resolve();
    });
  }

  // Function to capture a single viewport
  async function captureViewport() {
    try {
      const canvas = await html2canvas(document.documentElement, {
        useCORS: true,
        allowTaint: true,
        scrollY: -window.pageYOffset,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: window.innerHeight,
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
        scale: 2,
        logging: true,
        removeContainer: true,
        backgroundColor: null,
        onclone: function (clonedDoc) {
          // Remove capture elements from clone
          $(clonedDoc)
            .find(
              "#capture-button, #download-popup, #processing-overlay, .capture-button-inline"
            )
            .remove();
        },
      });
      return canvas;
    } catch (error) {
      console.error("Viewport capture error:", error);
      throw error;
    }
  }

  async function startCapture(clickedElement) {
    if (capturing) return;
    capturing = true;

    const $clickedButton = $(clickedElement);
    $clickedButton.addClass("capturing");
    $("#capture-button, .capture-button-inline").prop("disabled", true);

    // Show capturing progress
    const $progress = $(`
        <div id="capture-progress">
          <div class="progress-content">
            <div class="progress-bar"></div>
            <div class="progress-text">Capturing page...</div>
          </div>
        </div>
      `).appendTo("body");

    try {
      // Store original scroll position
      const originalScrollPos = window.pageYOffset;

      // Get total page height
      const totalHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );

      // Create final canvas
      const finalCanvas = document.createElement("canvas");
      const ctx = finalCanvas.getContext("2d");
      finalCanvas.width = document.documentElement.clientWidth * 2; // Scale factor of 2
      const finalHeight = totalHeight * 2; // Scale factor of 2
      finalCanvas.height = finalHeight;

      // Calculate number of viewports needed
      const viewportHeight = window.innerHeight;
      const totalViewports = Math.ceil(totalHeight / viewportHeight);
      let currentViewport = 0;

      // Start from top
      await smoothScroll(0);
      await delay(500); // Wait for page to settle

      // Capture each viewport
      while (currentViewport < totalViewports) {
        // Update progress
        const progress = (currentViewport / totalViewports) * 100;
        $(".progress-bar").css("width", progress + "%");
        $(".progress-text").text(`Capturing page... ${Math.round(progress)}%`);

        // Capture current viewport
        const viewportCanvas = await captureViewport();

        // Draw to final canvas
        ctx.drawImage(
          viewportCanvas,
          0,
          currentViewport * viewportHeight * 2, // Scale factor of 2
          viewportCanvas.width,
          viewportCanvas.height
        );

        // Scroll to next viewport
        currentViewport++;
        if (currentViewport < totalViewports) {
          await smoothScroll(currentViewport * viewportHeight);
          await delay(300); // Wait for content to settle
        }
      }

      // Restore original scroll position
      await smoothScroll(originalScrollPos);

      // Store captured canvas
      capturedCanvas = finalCanvas;

      // Remove progress indicator and show download popup
      $progress.remove();
      showDownloadPopup();
    } catch (error) {
      console.error("Capture failed:", error);
      alert("Failed to capture page. Please try again.");
      $progress.remove();
    } finally {
      $clickedButton.removeClass("capturing");
      $("#capture-button, .capture-button-inline").prop("disabled", false);
      capturing = false;
    }
  }

  async function convertToPdf() {
    if (!capturedCanvas) {
      alert("No capture available. Please capture the page first.");
      return;
    }

    showProcessingOverlay();

    try {
      const { jsPDF } = window.jspdf;

      // A4 dimensions in mm
      const a4Width = 210;
      const a4Height = 297;

      // Calculate scaling
      const imgWidth = capturedCanvas.width / 2; // Account for scale factor
      const imgHeight = capturedCanvas.height / 2;
      const ratio = imgWidth / imgHeight;

      let width = a4Width - 20; // 10mm margins on each side
      let height = width / ratio;

      // Create PDF
      const pdf = new jsPDF({
        orientation: height > a4Height ? "p" : "l",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // Split into pages if needed
      const pages = Math.ceil(height / (a4Height - 20)); // 10mm margins top and bottom
      for (let page = 0; page < pages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // Calculate slice height
        const sliceHeight = Math.min(
          imgHeight - page * (imgHeight / pages),
          imgHeight / pages
        );
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = imgWidth;
        canvas.height = sliceHeight;

        // Draw slice of original image
        ctx.drawImage(
          capturedCanvas,
          0,
          page * (imgHeight / pages) * 2, // Source coordinates (account for scale)
          imgWidth * 2,
          sliceHeight * 2, // Source dimensions (account for scale)
          0,
          0, // Destination coordinates
          imgWidth,
          sliceHeight // Destination dimensions
        );

        // Add to PDF
        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        pdf.addImage(
          imgData,
          "JPEG",
          10,
          10,
          width,
          (sliceHeight * width) / imgWidth
        );
      }

      pdf.save(document.title + "-capture.pdf");
      hideProcessingOverlay();
    } catch (error) {
      console.error("PDF conversion failed:", error);
      alert("Failed to convert to PDF. Please try again.");
      hideProcessingOverlay();
    }
  }

  function showProcessingOverlay() {
    $(`
        <div id="processing-overlay">
          <div class="processing-content">
            <div class="spinner"></div>
            <p>Converting to PDF...</p>
          </div>
        </div>
      `).appendTo("body");
  }

  function hideProcessingOverlay() {
    $("#processing-overlay").fadeOut(function () {
      $(this).remove();
    });
  }

  function showDownloadPopup() {
    $("#download-popup").remove();

    const popup = $(`
        <div id="download-popup">
          <div class="download-content">
            <h3>Capture Complete!</h3>
            <div class="download-buttons">
              <button id="download-png" class="download-btn">Download as PNG</button>
              <button id="download-pdf" class="download-btn">Download as PDF</button>
            </div>
          </div>
        </div>
      `).appendTo("body");

    $("#download-png").click(function () {
      capturedCanvas.toBlob(
        function (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = (document.title || "page-capture") + ".png";
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          popup.fadeOut(function () {
            $(this).remove();
          });
        },
        "image/png",
        1.0
      );
    });

    $("#download-pdf").click(function () {
      convertToPdf();
      popup.fadeOut(function () {
        $(this).remove();
      });
    });

    popup.click(function (e) {
      if ($(e.target).is("#download-popup")) {
        popup.fadeOut(function () {
          $(this).remove();
        });
      }
    });
  }

  // Initialize capture buttons
  $("#capture-button, .capture-button-inline").click(function () {
    startCapture(this);
  });
});
